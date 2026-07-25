"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// El tenant_id NO viaja en el formulario: el insert va sin tenant y la
// base lo exige vía RLS; lo tomamos del perfil del usuario autenticado
// en el servidor (que a su vez está protegido por RLS).
async function tenantDelUsuario() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  return { supabase, tenantId: perfil.tenant_id as string, userId: user.id };
}

export async function crearPaciente(formData: FormData) {
  const { supabase, tenantId } = await tenantDelUsuario();

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;

  const { data, error } = await supabase
    .from("pacientes")
    .insert({
      tenant_id: tenantId,
      nombre,
      rut: String(formData.get("rut") ?? "").trim() || null,
      telefono: String(formData.get("telefono") ?? "").trim() || null,
      email: String(formData.get("email") ?? "").trim() || null,
      fecha_nacimiento: String(formData.get("fecha_nacimiento") ?? "") || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  revalidatePath("/pacientes");
  redirect(`/pacientes/${data.id}`);
}

export async function crearReceta(formData: FormData) {
  const { supabase, tenantId, userId } = await tenantDelUsuario();

  const pacienteId = String(formData.get("paciente_id"));
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(",", ".").trim();
    return v === "" ? null : Number(v);
  };

  const { error } = await supabase.from("recetas").insert({
    tenant_id: tenantId,
    paciente_id: pacienteId,
    profesional_id: userId,
    od_esfera: num("od_esfera"),
    od_cilindro: num("od_cilindro"),
    od_eje: num("od_eje"),
    od_add: num("od_add"),
    oi_esfera: num("oi_esfera"),
    oi_cilindro: num("oi_cilindro"),
    oi_eje: num("oi_eje"),
    oi_add: num("oi_add"),
    av_od: String(formData.get("av_od") ?? "").trim() || null,
    av_oi: String(formData.get("av_oi") ?? "").trim() || null,
    dp: num("dp"),
    altura: num("altura"),
    tipo: String(formData.get("tipo") ?? "lejos"),
    notas: String(formData.get("notas") ?? "").trim() || null,
  });

  if (error) throw error;
  revalidatePath(`/pacientes/${pacienteId}`);
}
