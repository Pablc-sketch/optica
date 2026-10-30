"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { hoyEnChile } from "@/lib/fechas";
import { COSTOS, prefijoCosto, PREFIJO_MARCOS, type ClaveCosto } from "@/lib/pagos-operativo";
import { numerosDeOperativo, type VentaParaCierre } from "@/lib/cierre-operativo";
import { leerTodas } from "@/lib/leer-todas";
import { idPagoCosto } from "@/lib/id-pago";

type Resultado = { ok: boolean; error?: string };

async function admin() {
  return requerirPerfil({ roles: ["admin"], suscripcion: true });
}

function refrescar(operativoId: string) {
  revalidatePath(`/operativos/${operativoId}`);
  revalidatePath(`/operativos/${operativoId}/cierre`);
  revalidatePath("/reportes");
  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/operativos");
}

const UUID = /^[0-9a-f-]{36}$/i;
// Marca de los movimientos que crea esta pantalla: "Deshacer" solo toca
// estos, nunca un adelanto o un pago anotado a mano en Reportes.
const MOTIVO_CIERRE = "Pago del operativo (cierre)";
const PREFIJO_FIDES = "Fides · ";

// Registra únicamente el importe realmente pagado. El costo previsto se
// consulta en el servidor y no se altera al registrar un abono.
export async function registrarPagoCosto(input: {
  operativoId: string; clave: ClaveCosto | "fides" | "marcos"; monto: number;
  caja: "efectivo" | "digital"; pagadoEsperado: number;
}): Promise<Resultado> {
  let ctx;
  try { ctx = await admin(); } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  if (!UUID.test(input.operativoId) || !Number.isSafeInteger(input.pagadoEsperado) || input.pagadoEsperado < 0
    || !Number.isSafeInteger(input.monto) || input.monto <= 0
    || !["digital", "efectivo"].includes(input.caja)
    || (input.clave !== "fides" && input.clave !== "marcos" && !COSTOS.some((c) => c.clave === input.clave))) {
    return { ok: false, error: "Pago inválido." };
  }
  // Dos pestañas que pagan sobre el mismo saldo compiten por la misma PK.
  // Solo una inserta; un reintento con el mismo importe devuelve éxito.
  const movimientoId = idPagoCosto(input.operativoId, input.clave, input.pagadoEsperado);
  const { data: previo, error: previoError } = await ctx.supabase.from("gastos_globales")
    .select("id, operativo_id, monto, caja, descripcion").eq("id", movimientoId).maybeSingle();
  if (previoError) return { ok: false, error: "No se pudo comprobar el pago anterior." };
  const prefijo = input.clave === "fides" ? PREFIJO_FIDES : input.clave === "marcos" ? PREFIJO_MARCOS : prefijoCosto(input.clave);
  if (previo) return previo.operativo_id === input.operativoId && previo.monto === input.monto
    && previo.caja === input.caja && previo.descripcion.startsWith(prefijo)
    ? { ok: true } : { ok: false, error: "Identificador de pago ya utilizado." };
  const { data: op, error: opError } = await ctx.supabase.from("operativos").select("*")
    .eq("id", input.operativoId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (opError || !op) return { ok: false, error: "Operativo no disponible." };
  let total = input.clave === "fides" || input.clave === "marcos" ? 0 : Number(op[input.clave] ?? 0);
  if (input.clave === "fides" || input.clave === "marcos") {
    const [ventas, tenant] = await Promise.all([
      leerTodas((a, b) => ctx.supabase.from("ventas").select(`id, total, pagos_abonos (monto, medio_pago),
        venta_items (cantidad, precio_unitario, descuento, descripcion, cristal_slot,
          ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
          productos:producto_id (costo, categoria))`).eq("operativo_id", op.id).eq("anulada", false).order("id").range(a, b)),
      ctx.supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
    ]);
    if (ventas.error || tenant.error) return { ok: false, error: "No se pudo calcular el costo." };
    const { desglose } = numerosDeOperativo(op, ventas.data as unknown as VentaParaCierre[],
      Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0));
    total = input.clave === "fides" ? desglose.totalCristales : desglose.totalArmazones;
  }
  const pagos = await leerTodas((a, b) => ctx.supabase.from("gastos_globales").select("id, monto, descripcion")
    .eq("operativo_id", op.id).order("id").range(a, b));
  if (pagos.error) return { ok: false, error: "No se pudieron leer los abonos." };
  const yaPagado = (pagos.data ?? []).filter((p) => p.descripcion.startsWith(prefijo)).reduce((s, p) => s + p.monto, 0);
  if (yaPagado !== input.pagadoEsperado) return { ok: false, error: "Los abonos cambiaron. Recarga antes de pagar." };
  const saldo = Math.max(0, total - yaPagado);
  if (input.monto > saldo) return { ok: false, error: "El saldo cambió. Recarga antes de pagar." };
  const { error } = await ctx.supabase.from("gastos_globales").insert({
    id: movimientoId, tenant_id: ctx.tenantId, operativo_id: op.id,
    fecha: hoyEnChile(), categoria: "otro", descripcion: `${prefijo}${op.nombre}`.slice(0, 120),
    monto: input.monto, caja: input.caja, medio_pago: input.caja === "efectivo" ? "efectivo" : "transferencia",
  });
  if (error) return { ok: false, error: "No se pudo registrar. Recarga y revisa el historial antes de reintentar." };
  refrescar(op.id);
  return { ok: true };
}

// "Le pagué a X": queda anotado como sueldo pagado de ESTE operativo y la
// plata sale de la cuenta (o del efectivo). Así la caja deja de mostrar
// plata que ya se repartió.
export async function marcarSueldoPagado(input: {
  operativoId: string;
  persona: "isadora" | "madre" | "pablo" | "ahorro";
  // Lo que le corresponde EN TOTAL en este operativo. Se paga solo lo que
  // falta: tocar dos veces, o en dos pestañas, no paga dos veces.
  objetivo: number;
  caja: "digital" | "efectivo";
}): Promise<Resultado> {
  let ctx;
  try {
    ctx = await admin();
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  if (!UUID.test(input.operativoId)) return { ok: false, error: "Operativo inválido." };
  if (!["isadora", "madre", "pablo", "ahorro"].includes(input.persona)) return { ok: false, error: "Persona inválida." };
  if (!Number.isInteger(input.objetivo) || input.objetivo <= 0) return { ok: false, error: "Monto inválido." };
  if (input.caja !== "digital" && input.caja !== "efectivo") return { ok: false, error: "Caja inválida." };
  const { data: op, error: opError } = await ctx.supabase.from("operativos").select("*")
    .eq("id", input.operativoId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (opError || !op) return { ok: false, error: "Operativo no disponible." };
  const [ventas, tenant] = await Promise.all([
    leerTodas((a, b) => ctx.supabase.from("ventas").select(`id, total, pagos_abonos (monto, medio_pago),
      venta_items (cantidad, precio_unitario, descuento, descripcion, cristal_slot,
        ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
        productos:producto_id (costo, categoria))`).eq("operativo_id", op.id).eq("anulada", false).order("id").range(a, b)),
    ctx.supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
  ]);
  if (ventas.error || tenant.error) return { ok: false, error: "No se pudo comprobar el reparto." };
  const n = numerosDeOperativo(op, ventas.data as unknown as VentaParaCierre[],
    Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0));
  if (input.objetivo !== n.cierre[input.persona]) return { ok: false, error: "El reparto cambió. Recarga antes de pagar." };
  const { data: previos, error: errPrevios } = await ctx.supabase
    .from("retiros_sueldo")
    .select("monto")
    .eq("operativo_id", input.operativoId)
    .eq("persona", input.persona);
  if (errPrevios) return { ok: false, error: errPrevios.message };
  const yaPagado = (previos ?? []).reduce((s, r) => s + r.monto, 0);
  const falta = input.objetivo - yaPagado;
  if (falta <= 0) return { ok: true };
  const { error } = await ctx.supabase.from("retiros_sueldo").insert({
    id: idPagoCosto(input.operativoId, `retiro:${input.persona}`, yaPagado),
    tenant_id: ctx.tenantId,
    persona: input.persona,
    fecha: hoyEnChile(),
    monto: falta,
    medio_pago: input.caja === "efectivo" ? "efectivo" : "transferencia",
    caja: input.caja,
    es_sueldo: true,
    motivo: MOTIVO_CIERRE,
    operativo_id: input.operativoId,
  });
  if (error) return { ok: false, error: error.message };
  refrescar(input.operativoId);
  return { ok: true };
}

// Deshacer un "pagado" tocado por error: borra SOLO el último pago que
// marcó esta pantalla para esa persona en este operativo. Los adelantos y
// pagos anotados a mano quedan como están.
export async function deshacerSueldoPagado(input: { operativoId: string; persona: string }): Promise<Resultado> {
  let ctx;
  try {
    ctx = await admin();
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const { data: ultimo, error: errUltimo } = await ctx.supabase
    .from("retiros_sueldo")
    .select("id")
    .eq("operativo_id", input.operativoId)
    .eq("persona", input.persona)
    .in("motivo", [MOTIVO_CIERRE, "Pago del operativo"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errUltimo) return { ok: false, error: errUltimo.message };
  if (!ultimo) return { ok: false, error: "No hay un pago marcado desde esta pantalla para deshacer." };
  const { error } = await ctx.supabase.from("retiros_sueldo").delete().eq("id", ultimo.id);
  if (error) return { ok: false, error: error.message };
  refrescar(input.operativoId);
  return { ok: true };
}

// Lo que se le pagó al ayudante (ej. Diego). Es costo del operativo.
export async function guardarAyudante(input: { operativoId: string; monto: number }): Promise<Resultado> {
  let ctx;
  try {
    ctx = await admin();
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  if (!Number.isInteger(input.monto) || input.monto < 0) return { ok: false, error: "Monto inválido." };
  const { data, error } = await ctx.supabase
    .from("operativos")
    .update({ costo_ayudante: input.monto })
    .eq("id", input.operativoId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "No se guardó." };
  refrescar(input.operativoId);
  return { ok: true };
}

// "Le pagué a Fides los cristales de este operativo": sale de la cuenta.
// No cambia la utilidad (los cristales ya están contados como costo).
export async function marcarFidesPagado(input: { operativoId: string; nombre: string; monto: number; pagado: boolean }): Promise<Resultado> {
  let ctx;
  try {
    ctx = await admin();
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const { data: existentes, error: errExist } = await ctx.supabase
    .from("gastos_globales")
    .select("id")
    .eq("operativo_id", input.operativoId)
    .like("descripcion", `${PREFIJO_FIDES}%`)
    .order("created_at", { ascending: false });
  if (errExist) return { ok: false, error: errExist.message };
  if (!input.pagado) {
    // Solo el último pago a Fides marcado desde esta pantalla.
    const ultimo = existentes?.[0];
    if (!ultimo) return { ok: true };
    const { error } = await ctx.supabase.from("gastos_globales").delete().eq("id", ultimo.id);
    if (error) return { ok: false, error: error.message };
    refrescar(input.operativoId);
    return { ok: true };
  }
  // Ya marcado (doble toque, otra pestaña): no se anota dos veces.
  if ((existentes ?? []).length > 0) return { ok: true };
  if (!Number.isInteger(input.monto) || input.monto <= 0) return { ok: false, error: "Monto inválido." };
  const { error } = await ctx.supabase.from("gastos_globales").insert({
    tenant_id: ctx.tenantId,
    fecha: hoyEnChile(),
    categoria: "otro",
    descripcion: `${PREFIJO_FIDES}${input.nombre}`.slice(0, 120),
    monto: input.monto,
    medio_pago: "transferencia",
    caja: "digital",
    operativo_id: input.operativoId,
  });
  if (error) return { ok: false, error: error.message };
  refrescar(input.operativoId);
  return { ok: true };
}
