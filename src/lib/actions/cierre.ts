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

// "Le pagué a X": queda anotado como sueldo pagado de ESTE operativo y la
// plata sale de la cuenta (o del efectivo). Así la caja deja de mostrar
// plata que ya se repartió.
export async function marcarSueldoPagado(input: {
  operativoId: string;
  persona: "isadora" | "madre" | "pablo";
  monto: number;
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
  if (!Number.isInteger(input.monto) || input.monto <= 0) return { ok: false, error: "Monto inválido." };
  const { error } = await ctx.supabase.from("retiros_sueldo").insert({
    tenant_id: ctx.tenantId,
    persona: input.persona,
    fecha: hoyEnChile(),
    monto: input.monto,
    medio_pago: input.caja === "efectivo" ? "efectivo" : "transferencia",
    caja: input.caja,
    es_sueldo: true,
    motivo: "Pago del operativo",
    operativo_id: input.operativoId,
  });
  if (error) return { ok: false, error: error.message };
  refrescar(input.operativoId);
  return { ok: true };
}

// Deshacer un "pagado" tocado por error: borra los pagos de sueldo de esa
// persona en este operativo.
export async function deshacerSueldoPagado(input: { operativoId: string; persona: string }): Promise<Resultado> {
  let ctx;
  try {
    ctx = await admin();
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const { error } = await ctx.supabase
    .from("retiros_sueldo")
    .delete()
    .eq("operativo_id", input.operativoId)
    .eq("persona", input.persona)
    .eq("es_sueldo", true);
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
  if (!input.pagado) {
    const { error } = await ctx.supabase
      .from("gastos_globales")
      .delete()
      .eq("operativo_id", input.operativoId)
      .like("descripcion", "Fides%");
    if (error) return { ok: false, error: error.message };
    refrescar(input.operativoId);
    return { ok: true };
  }
  if (!Number.isInteger(input.monto) || input.monto <= 0) return { ok: false, error: "Monto inválido." };
  const { error } = await ctx.supabase.from("gastos_globales").insert({
    tenant_id: ctx.tenantId,
    fecha: hoyEnChile(),
    categoria: "otro",
    descripcion: `Fides · ${input.nombre}`.slice(0, 120),
    monto: input.monto,
    medio_pago: "transferencia",
    caja: "digital",
    operativo_id: input.operativoId,
  });
  if (error) return { ok: false, error: error.message };
  refrescar(input.operativoId);
  return { ok: true };
}
