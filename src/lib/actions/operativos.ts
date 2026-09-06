"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearTelefono } from "@/lib/formato";

const TIPOS_VENUE = [
  "condominio",
  "junta_vecinos",
  "apr",
  "colegio",
  "sala_cuna",
  "supermercado",
  "otro",
] as const;

// Mismo patrón que requerirAdmin() en configuracion.ts: el tenant y el rol
// se toman de la base, nunca del formulario, así que no se puede crear un
// operativo en otra óptica manipulando el HTML.
async function requerirAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id, rol").eq("id", user.id).single();
  if (!perfil || perfil.rol !== "admin") {
    throw new Error("Solo el administrador de la óptica puede crear operativos");
  }
  return { supabase, tenantId: perfil.tenant_id as string };
}

// Si viene una fecha de término anterior a la de inicio (dato mal
// tipeado), se ignora en vez de guardar un rango invertido — mejor
// "sin fecha de término" que un rango que no tiene sentido.
function parsearFechaFin(valor: FormDataEntryValue | null, fechaInicio: string): string | null {
  const fechaFin = String(valor ?? "").trim();
  if (!fechaFin || fechaFin < fechaInicio) return null;
  return fechaFin;
}

export async function crearOperativo(formData: FormData) {
  const { supabase, tenantId } = await requerirAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!nombre || !fecha) return;

  const tipoVenue = String(formData.get("tipo_venue") ?? "");

  const { error } = await supabase.from("operativos").insert({
    tenant_id: tenantId,
    nombre,
    fecha,
    fecha_fin: parsearFechaFin(formData.get("fecha_fin"), fecha),
    tipo_venue: (TIPOS_VENUE as readonly string[]).includes(tipoVenue) ? tipoVenue : null,
    direccion: String(formData.get("direccion") ?? "").trim() || null,
    contacto_nombre: String(formData.get("contacto_nombre") ?? "").trim() || null,
    contacto_telefono: formatearTelefono(String(formData.get("contacto_telefono") ?? "")) || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath("/operativos");
}

// Corregir nombre, fechas, lugar o contacto después de creado (ej. "OPV
// Departamento Pudahuel" que en verdad dura varios días, o se cambió la
// dirección) — sin esto había que borrar y crear todo de nuevo.
export async function actualizarOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!id || !nombre || !fecha) return;

  const tipoVenue = String(formData.get("tipo_venue") ?? "");

  const { error } = await supabase
    .from("operativos")
    .update({
      nombre,
      fecha,
      fecha_fin: parsearFechaFin(formData.get("fecha_fin"), fecha),
      tipo_venue: (TIPOS_VENUE as readonly string[]).includes(tipoVenue) ? tipoVenue : null,
      direccion: String(formData.get("direccion") ?? "").trim() || null,
      contacto_nombre: String(formData.get("contacto_nombre") ?? "").trim() || null,
      contacto_telefono: formatearTelefono(String(formData.get("contacto_telefono") ?? "")) || null,
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/operativos");
}

export async function cambiarEstadoOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  if (!id || !["planificado", "realizado", "cancelado"].includes(estado)) return;

  const { error } = await supabase.from("operativos").update({ estado }).eq("id", id);
  if (error) throw error;

  revalidatePath("/operativos");
}

function parsearMonto(valor: FormDataEntryValue | null): number {
  const n = Math.round(Number(String(valor ?? "").replace(/\./g, "")));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Vacío = sin meta (no se muestra barra de progreso), a diferencia de los
// costos donde vacío es 0.
function parsearMetaOpcional(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").replace(/\./g, "").trim();
  if (!texto) return null;
  const n = Math.round(Number(texto));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Costos reales del operativo (para ver utilidad neta) y metas del día
// (examenes/monto, opcionales) — se editan juntos desde el detalle porque
// ambos son "planificación" del operativo, no algo que se cargue al crear.
export async function actualizarDetallesOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase
    .from("operativos")
    .update({
      costo_transporte: parsearMonto(formData.get("costo_transporte")),
      costo_arriendo: parsearMonto(formData.get("costo_arriendo")),
      costo_viaticos: parsearMonto(formData.get("costo_viaticos")),
      costo_otros: parsearMonto(formData.get("costo_otros")),
      meta_examenes: parsearMetaOpcional(formData.get("meta_examenes")),
      meta_ventas: parsearMetaOpcional(formData.get("meta_ventas")),
      meta_utilidad: parsearMetaOpcional(formData.get("meta_utilidad")),
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/operativos");
  revalidatePath("/operativos/comparar");
}
