"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { hoyEnChile } from "@/lib/fechas";

type Resultado = { ok: boolean; error?: string };

async function admin() {
  return requerirPerfil({ roles: ["admin"], suscripcion: true });
}

function refrescar(operativoId: string) {
  revalidatePath(`/operativos/${operativoId}`);
  revalidatePath(`/operativos/${operativoId}/cierre`);
  revalidatePath("/reportes");
  revalidatePath("/");
}

const UUID = /^[0-9a-f-]{36}$/i;
// Marca de los movimientos que crea esta pantalla: "Deshacer" solo toca
// estos, nunca un adelanto o un pago anotado a mano en Reportes.
const MOTIVO_CIERRE = "Pago del operativo (cierre)";
const PREFIJO_FIDES = "Fides · ";

// "Le pagué a X": queda anotado como sueldo pagado de ESTE operativo y la
// plata sale de la cuenta (o del efectivo). Así la caja deja de mostrar
// plata que ya se repartió.
export async function marcarSueldoPagado(input: {
  operativoId: string;
  persona: "isadora" | "madre" | "pablo";
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
  if (!["isadora", "madre", "pablo"].includes(input.persona)) return { ok: false, error: "Persona inválida." };
  if (!Number.isInteger(input.objetivo) || input.objetivo <= 0) return { ok: false, error: "Monto inválido." };
  if (input.caja !== "digital" && input.caja !== "efectivo") return { ok: false, error: "Caja inválida." };
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
