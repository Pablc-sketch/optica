"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";

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
  if (!nombre) return { ok: false as const, error: "El nombre es obligatorio." };

  const { data, error } = await supabase
    .from("pacientes")
    .insert({
      tenant_id: tenantId,
      nombre,
      rut: formatearRut(String(formData.get("rut") ?? "")) || null,
      telefono: formatearTelefono(String(formData.get("telefono") ?? "")) || null,
      email: String(formData.get("email") ?? "").trim() || null,
      fecha_nacimiento: String(formData.get("fecha_nacimiento") ?? "") || null,
    })
    .select("id")
    .single();

  // Antes esto lanzaba la excepción tal cual y la pantalla se caía con un
  // error de servidor. El caso más común no es un fallo técnico sino de
  // permisos: bodega no puede tocar fichas clínicas (RLS), así que conviene
  // decirlo en castellano en vez de mostrar una pantalla rota.
  if (error) {
    const esPermiso = error.code === "42501" || /row-level security|policy/i.test(error.message);
    return {
      ok: false as const,
      error: esPermiso
        ? "Tu rol no permite crear pacientes. Solo Administrador y Clínico pueden hacerlo; pídele a quien administra la óptica que te cambie el rol en Configuración."
        : "No se pudo guardar el paciente. Revisa los datos e inténtalo de nuevo.",
    };
  }

  revalidatePath("/pacientes");
  return { ok: true as const, id: data.id as string };
}

export async function actualizarFichaClinica(formData: FormData) {
  const { supabase } = await tenantDelUsuario();
  const pacienteId = String(formData.get("paciente_id"));
  const texto = (k: string) => String(formData.get(k) ?? "").trim() || null;

  const { error } = await supabase
    .from("pacientes")
    .update({
      diabetes: formData.get("diabetes") === "on",
      hipertension: formData.get("hipertension") === "on",
      glaucoma: formData.get("glaucoma") === "on",
      cirugia_ocular: formData.get("cirugia_ocular") === "on",
      usa_lentes_contacto: formData.get("usa_lentes_contacto") === "on",
      alergias: texto("alergias"),
      medicamentos: texto("medicamentos"),
      ocupacion: texto("ocupacion"),
      horas_pantalla: texto("horas_pantalla"),
      antecedentes_otros: texto("antecedentes_otros"),
      notas: texto("notas"),
    })
    .eq("id", pacienteId);

  if (error) throw error;
  revalidatePath(`/pacientes/${pacienteId}`);
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

  // La receta recién cargada es la que tomará la OT al cobrar en el POS.
  await supabase.from("pacientes").update({ ultima_visita: new Date().toISOString().slice(0, 10) }).eq("id", pacienteId);

  revalidatePath(`/pacientes/${pacienteId}`);
  revalidatePath("/ventas");
}
