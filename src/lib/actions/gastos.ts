"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Mismo patrón que el resto de actions administrativas: el tenant sale de
// la base, nunca del formulario.
async function requerirTenant() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  return { supabase, tenantId: perfil.tenant_id as string };
}

function parsearMonto(valor: FormDataEntryValue | null): number | null {
  const n = Math.round(Number(String(valor ?? "").replace(/\./g, "")));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

const CATEGORIAS_GASTO = ["compra_inventario", "arriendo", "otro"] as const;
const MEDIOS_PAGO = ["efectivo", "debito", "credito", "transferencia"] as const;
// "ahorro" no es una persona, es el ahorro del negocio (20% que calcula el
// reparto) — se guarda en la misma tabla para poder marcar cuándo se
// aparta de verdad, igual que un retiro de cualquiera de los tres.
const PERSONAS = ["isadora", "madre", "pablo", "ahorro"] as const;

function parsearMedioPago(valor: FormDataEntryValue | null): string | null {
  const v = String(valor ?? "");
  return (MEDIOS_PAGO as readonly string[]).includes(v) ? v : null;
}

// Gasto que no nace de un operativo puntual: reponer stock (marcos,
// bandejas), arriendos fijos, cualquier costo del negocio en general. Se
// guarda aparte de los costos de cada operativo para no mezclarlos —
// "esto no es del operativo, es un costo global" fue la instrucción
// explícita al pedirlo.
export async function crearGastoGlobal(formData: FormData) {
  const { supabase, tenantId } = await requerirTenant();

  const fecha = String(formData.get("fecha") ?? "").trim();
  const descripcion = String(formData.get("descripcion") ?? "").trim();
  const monto = parsearMonto(formData.get("monto"));
  const categoria = String(formData.get("categoria") ?? "");
  if (!fecha || !descripcion || monto === null) return;

  const { error } = await supabase.from("gastos_globales").insert({
    tenant_id: tenantId,
    fecha,
    descripcion,
    monto,
    categoria: (CATEGORIAS_GASTO as readonly string[]).includes(categoria) ? categoria : "otro",
    medio_pago: parsearMedioPago(formData.get("medio_pago")),
  });
  if (error) throw error;

  revalidatePath("/reportes");
}

export async function eliminarGastoGlobal(formData: FormData) {
  const { supabase } = await requerirTenant();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("gastos_globales").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/reportes");
}

// Plata que Isadora, la mamá o Pablo sacan por adelantado (en efectivo o de
// la cuenta), contra lo que les corresponde de sueldo. No es un gasto del
// negocio — esa plata ya era de esa persona — por eso se descuenta de lo
// que se le debe en vez de sumarse a los costos.
//
// El caso contrario también se guarda acá: un APORTE es cuando esa persona
// pone plata propia al negocio (ej. cubrir la diferencia al pagarle al
// laboratorio), y se guarda como un retiro NEGATIVO — así "lo que se le
// debe menos el retiro" ya sirve para los dos casos sin lógica aparte: un
// aporte negativo resta un negativo, o sea, SUMA a lo que se le debe.
export async function crearRetiro(formData: FormData) {
  const { supabase, tenantId } = await requerirTenant();

  const persona = String(formData.get("persona") ?? "");
  const fecha = String(formData.get("fecha") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "retiro");
  const montoPositivo = parsearMonto(formData.get("monto"));
  if (!(PERSONAS as readonly string[]).includes(persona) || !fecha || montoPositivo === null || montoPositivo === 0)
    return;
  const monto = tipo === "aporte" ? -montoPositivo : montoPositivo;

  const operativoId = String(formData.get("operativo_id") ?? "").trim();

  const { error } = await supabase.from("retiros_sueldo").insert({
    tenant_id: tenantId,
    persona,
    fecha,
    monto,
    medio_pago: parsearMedioPago(formData.get("medio_pago")),
    motivo: String(formData.get("motivo") ?? "").trim() || null,
    operativo_id: operativoId || null,
  });
  if (error) throw error;

  revalidatePath("/reportes");
}

export async function eliminarRetiro(formData: FormData) {
  const { supabase } = await requerirTenant();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("retiros_sueldo").delete().eq("id", id);
  if (error) throw error;

  revalidatePath("/reportes");
}

function parsearPorcentaje(valor: FormDataEntryValue | null): number {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

// Lo que el procesador de tarjeta (Mercado Pago) descuenta antes de
// depositar — casi nunca es la misma tasa por débito que por crédito, así
// que van separadas. Se usa en Reportes para que "En cuenta" muestre lo
// que de verdad llega a la cuenta, no lo que se le cobró al paciente.
export async function actualizarComisionMedioPago(formData: FormData) {
  const { supabase, tenantId } = await requerirTenant();

  const { error } = await supabase
    .from("tenants")
    .update({
      comision_debito_pct: parsearPorcentaje(formData.get("comision_debito_pct")),
      comision_credito_pct: parsearPorcentaje(formData.get("comision_credito_pct")),
    })
    .eq("id", tenantId);
  if (error) throw error;

  revalidatePath("/reportes");
}
