"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { fechaValidaDocumento } from "@/lib/fecha-documentos";
import { hoyEnChile } from "@/lib/fechas";
import { COSTOS, prefijoCosto, PREFIJO_MARCOS, type ClaveCosto, pagosConAsignaciones } from "@/lib/pagos-operativo";
import { numerosDeOperativo, type VentaParaCierre } from "@/lib/cierre-operativo";
import { leerTodas } from "@/lib/leer-todas";
import { idPagoCosto } from "@/lib/id-pago";
import { contarLentesYMarcos, type VentaChequeo } from "@/lib/chequeos";
import { montoCaja } from "@/lib/caja-fuentes";

type Resultado = { ok: boolean; error?: string };

async function admin() {
  return requerirPerfil({ roles: ["admin"], suscripcion: true });
}

function refrescar(operativoId: string) {
  revalidatePath(`/operativos/${operativoId}`);
  revalidatePath(`/operativos/${operativoId}/cierre`);
  revalidatePath("/reportes");
  revalidatePath("/caja");
  revalidatePath("/");
  revalidatePath("/pagos");
  revalidatePath("/gastos");
  revalidatePath("/operativos");
}

const UUID = /^[0-9a-f-]{36}$/i;
// Marca de los movimientos que crea esta pantalla: "Deshacer" solo toca
// estos, nunca un adelanto o un pago anotado a mano en Reportes.
const PREFIJO_FIDES = "Fides · ";

export async function actualizarCostoFides(_: { error?: string; guardado?: boolean }, f: FormData): Promise<{ error?: string; guardado?: boolean }> {
  const ctx = await admin();
  const id = String(f.get('operativo_id') ?? '');
  const monto = montoCaja(f.get('monto'),true);
  const nota = String(f.get('nota') ?? '').trim();
  if (!UUID.test(id) || monto === null || !nota || nota.length > 250) return { error:'Indica el total real de Fides y el motivo.' };
  const anterior = String(f.get('anterior') ?? '');
  const { data: op, error } = await ctx.supabase.from('operativos').select('id,costo_fides_real').eq('id',id).eq('tenant_id',ctx.tenantId).maybeSingle();
  if (error || !op) return { error:'Operativo no disponible.' };
  if (String(op.costo_fides_real ?? '') !== anterior) return { error:'El costo cambió en otra sesión. Recarga antes de guardar.' };
  let cambio = ctx.supabase.from('operativos').update({ costo_fides_real:monto,costo_fides_nota:nota }).eq('id',id).eq('tenant_id',ctx.tenantId);
  cambio = op.costo_fides_real === null ? cambio.is('costo_fides_real',null) : cambio.eq('costo_fides_real',op.costo_fides_real);
  const guardado = await cambio.select('id').maybeSingle();
  if (guardado.error || !guardado.data) return { error:'No se pudo guardar. Recarga y revisa el costo.' };
  refrescar(id);
  return { guardado:true };
}

// Registra únicamente el importe realmente pagado. El costo previsto se
// consulta en el servidor y no se altera al registrar un abono.
type PagoCostoInput = {
  operativoId: string; clave: ClaveCosto | "fides" | "marcos"; monto: number;
  caja: "efectivo" | "digital" | "personal"; pagadoEsperado: number; fecha?: string;
};

async function prepararPagoCosto(ctx: Awaited<ReturnType<typeof admin>>, input: PagoCostoInput, chequeoId?: string) {
  if ((input.fecha && (!fechaValidaDocumento(input.fecha) || input.fecha > hoyEnChile())) || !UUID.test(input.operativoId) || !Number.isSafeInteger(input.pagadoEsperado) || input.pagadoEsperado < 0
    || !Number.isSafeInteger(input.monto) || input.monto <= 0
    || !["digital", "efectivo", "personal"].includes(input.caja)
    || (input.clave !== "fides" && input.clave !== "marcos" && !COSTOS.some((c) => c.clave === input.clave))) {
    return { error: "Pago inválido." };
  }
  // Dos pestañas que pagan sobre el mismo saldo compiten por la misma PK.
  // Solo una inserta; un reintento con el mismo importe devuelve éxito.
  let movimientoId = idPagoCosto(input.operativoId, input.clave, input.pagadoEsperado);
  const prefijo = input.clave === "fides" ? PREFIJO_FIDES : input.clave === "marcos" ? PREFIJO_MARCOS : prefijoCosto(input.clave);
  // Si un pago se corrigió a cero, su ID se conserva en el historial.
  // Reservar otra clave evita que ese registro bloquee un pago real posterior.
  for (let intento = 0; ; intento++) {
    const { data: previo, error: previoError } = await ctx.supabase.from("gastos_globales")
      .select("id, operativo_id, monto, caja, descripcion, revision_version").eq("id", movimientoId).maybeSingle();
    if (previoError) return { error: "No se pudo comprobar el pago anterior." };
    if (!previo) break;
    if (previo.operativo_id === input.operativoId && previo.monto === input.monto
      && previo.caja === input.caja && previo.descripcion.startsWith(prefijo)) return {};
    if (!previo.revision_version || intento >= 20) return { error: "Identificador de pago ya utilizado. Revisa los movimientos." };
    movimientoId = idPagoCosto(input.operativoId, `${input.clave}:revisado:${previo.id}:${previo.revision_version}`, input.pagadoEsperado);
  }
  const { data: op, error: opError } = await ctx.supabase.from("operativos").select("*")
    .eq("id", input.operativoId).eq("tenant_id", ctx.tenantId).maybeSingle();
  if (opError || !op) return { error: "Operativo no disponible." };
  if (chequeoId && (op.chequeo_id !== chequeoId || op.estado === "cancelado" || op.pagos_saldados_en))
    return { error: "La sede cambió o ya está saldada. Recarga para revisar." };
  let total = input.clave === "fides" || input.clave === "marcos" ? 0 : Number(op[input.clave] ?? 0);
  if (input.clave === "fides" || input.clave === "marcos") {
    const [ventas, tenant] = await Promise.all([
      leerTodas((a, b) => ctx.supabase.from("ventas").select(`id, total, pagos_abonos (monto, medio_pago),
        venta_items (producto_id, cantidad, precio_unitario, descuento, descripcion, cristal_slot,
          ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2, marco_propio, marco_propio_2, armazon_producto_id, armazon_producto_id_2),
          productos:producto_id (costo, categoria))`).eq("operativo_id", op.id).eq("anulada", false).order("id").range(a, b)),
      ctx.supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
    ]);
    if (ventas.error || tenant.error) return { error: "No se pudo calcular el costo." };
    const marcos = chequeoId && input.clave === "marcos"
      ? (ventas.data as unknown as VentaChequeo[]).reduce((n, v) => n + contarLentesYMarcos(v.venta_items ?? []).marcos, 0)
      : undefined;
    const { desglose } = numerosDeOperativo(op, ventas.data as unknown as VentaParaCierre[],
      Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0), marcos);
    total = input.clave === "fides" ? desglose.totalCristales : desglose.totalArmazones;
  }
  const pagos = await leerTodas((a, b) => ctx.supabase.from("gastos_globales").select("id, monto, descripcion")
    .eq("operativo_id", op.id).order("id").range(a, b));
  if (pagos.error) return { error: "No se pudieron leer los abonos." };
  const asignaciones = await leerTodas((a,b) => ctx.supabase.from("gastos_asignaciones").select("id,gasto_id,operativo_id,clave,monto,anulado_en").eq("operativo_id",op.id).order("id").range(a,b));
  if (asignaciones.error) return {error:"No se pudieron comprobar los pagos vinculados."};
  const yaPagado = pagosConAsignaciones(pagos.data ?? [],asignaciones.data ?? [],op.id).filter((p) => p.descripcion.startsWith(prefijo)).reduce((s,p) => s+p.monto,0);
  if (yaPagado !== input.pagadoEsperado) return { error: "Los abonos cambiaron. Recarga antes de pagar." };
  const saldo = Math.max(0, total - yaPagado);
  if (input.monto > saldo) return { error: "El saldo cambió. Recarga antes de pagar." };
  return { registro: {
    id: movimientoId, tenant_id: ctx.tenantId, operativo_id: op.id,
    fecha: input.fecha ?? hoyEnChile(), categoria: "otro", descripcion: `${prefijo}${op.nombre}`.slice(0, 120),
    monto: input.monto, caja: input.caja, medio_pago: input.caja === "personal" ? null : input.caja === "efectivo" ? "efectivo" : "transferencia",
  } };
}

async function guardarPagosCosto(inputs: PagoCostoInput[], chequeoId?: string): Promise<Resultado> {
  let ctx;
  try { ctx = await admin(); } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const preparados = await Promise.all(inputs.map(input => prepararPagoCosto(ctx, input, chequeoId)));
  const error = preparados.find(p => p.error)?.error;
  if (error) return { ok: false, error };
  const registros = preparados.flatMap(p => p.registro ? [p.registro] : []);
  if (registros.length) {
    const insercion = await ctx.supabase.from("gastos_globales").insert(registros.length === 1 ? registros[0] : registros);
    if (insercion.error) return { ok: false, error: "No se pudo registrar. Recarga y revisa los pagos antes de reintentar." };
  }
  for (const input of inputs) refrescar(input.operativoId);
  if (chequeoId) revalidatePath("/operativos/chequeos");
  return { ok: true };
}

export async function registrarPagoCosto(input: PagoCostoInput): Promise<Resultado> {
  return guardarPagosCosto([input]);
}

export async function registrarPagosChequeo(chequeoId: string, inputs: PagoCostoInput[]): Promise<Resultado> {
  if (!UUID.test(chequeoId) || !Array.isArray(inputs) || inputs.length < 1 || inputs.length > 100
    || !inputs.every(input => input && ["fides", "marcos"].includes(input.clave) && input.clave === inputs[0].clave)
    || new Set(inputs.map(input => input.operativoId)).size !== inputs.length) {
    return { ok: false, error: "Revisa las sedes y el costo a registrar." };
  }
  return guardarPagosCosto(inputs, chequeoId);
}

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

export async function guardarPagoCostosChequeo(_: { error?: string }, datos: FormData): Promise<{ error?: string }> {
  const chequeoId = String(datos.get("chequeo_id") ?? "");
  const clave = String(datos.get("clave") ?? "");
  const caja = String(datos.get("caja") ?? "");
  const fecha = String(datos.get("fecha") ?? "");
  if ((clave !== "fides" && clave !== "marcos") || (caja !== "digital" && caja !== "efectivo") || !fechaValidaDocumento(fecha)) {
    return { error: "Revisa el origen y la fecha del pago." };
  }
  const inputs = datos.getAll("sede").map<PagoCostoInput>(valor => {
    const [operativoId, pagadoEsperado, monto] = String(valor).split("|");
    return { operativoId, clave, caja, fecha, monto: Number(monto), pagadoEsperado: Number(pagadoEsperado) };
  });
  const resultado = await registrarPagosChequeo(chequeoId, inputs);
  if (!resultado.ok) return { error: resultado.error };
  redirect(`/caja?chequeo=${chequeoId}&guardado=1#costos`);
}
