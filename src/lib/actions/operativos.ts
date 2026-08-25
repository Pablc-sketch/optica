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
    tipo_venue: (TIPOS_VENUE as readonly string[]).includes(tipoVenue) ? tipoVenue : null,
    direccion: String(formData.get("direccion") ?? "").trim() || null,
    contacto_nombre: String(formData.get("contacto_nombre") ?? "").trim() || null,
    contacto_telefono: formatearTelefono(String(formData.get("contacto_telefono") ?? "")) || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  });
  if (error) throw error;

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
