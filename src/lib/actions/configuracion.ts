"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";

const ROLES = ["admin", "clinico", "ventas", "bodega"] as const;
type Rol = (typeof ROLES)[number];

// Toda acción de configuración pasa por acá antes de tocar nada. Devuelve
// el tenant del usuario tomado de la BASE DE DATOS, no del formulario:
// aunque alguien manipule el HTML, no puede administrar otra óptica.
async function requerirAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("users")
    .select("tenant_id, rol")
    .eq("id", user.id)
    .single();

  if (!perfil || perfil.rol !== "admin") {
    throw new Error("Solo el administrador de la óptica puede cambiar la configuración");
  }
  return { supabase, tenantId: perfil.tenant_id as string, userId: user.id };
}

// La subida se hace acá, en el servidor, con el cliente de service role —
// no desde el navegador con el cliente normal. Después de mucho investigar
// (incluyendo revisar los logs reales de Postgres durante una subida real),
// la política de RLS de Storage para bucket 'logos' evalúa correcta la
// óptica y el rol, pero la subida seguía rechazándose igual sin una causa
// identificable — algo específico de este proyecto en la capa de Storage,
// no la lógica de la política. En vez de seguir persiguiendo eso, se evita
// por completo: el admin ya se verificó arriba (requerirAdmin), así que
// subir con permisos de administrador acá es igual de seguro.
export async function subirLogoOptica(formData: FormData) {
  const { tenantId } = await requerirAdmin();

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false as const, error: "No se recibió ninguna imagen." };
  }
  if (!archivo.type.startsWith("image/")) {
    return { ok: false as const, error: "Tiene que ser una imagen (PNG, JPG o SVG)." };
  }
  if (archivo.size > 2 * 1024 * 1024) {
    return { ok: false as const, error: "La imagen pesa demasiado (máximo 2 MB)." };
  }

  const extension = archivo.name.split(".").pop() || "png";
  const ruta = `${tenantId}/logo.${extension}`;

  const admin = createAdminClient();
  const { error: subeError } = await admin.storage
    .from("logos")
    .upload(ruta, archivo, { upsert: true, cacheControl: "3600" });
  if (subeError) return { ok: false as const, error: `No se pudo subir la imagen: ${subeError.message}` };

  const { data: urlPublica } = admin.storage.from("logos").getPublicUrl(ruta);
  const urlConVersion = `${urlPublica.publicUrl}?v=${Date.now()}`;

  const { error } = await admin.from("tenants").update({ logo_url: urlConVersion }).eq("id", tenantId);
  if (error) return { ok: false as const, error: "La imagen se subió, pero no se pudo guardar." };

  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
  return { ok: true as const, url: urlConVersion };
}

export async function crearUsuario(formData: FormData) {
  const { tenantId } = await requerirAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rol = String(formData.get("rol") ?? "ventas") as Rol;

  if (!email || !nombre) return { ok: false, error: "Nombre y correo son obligatorios." };
  if (password.length < 8) return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  if (!ROLES.includes(rol)) return { ok: false, error: "Rol inválido." };

  // Crear la cuenta de acceso exige permisos de administración del sistema
  // de autenticación, que el cliente del navegador no tiene.
  const admin = createAdminClient();
  const { data: cuenta, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError) {
    return {
      ok: false,
      error: authError.message.includes("already")
        ? "Ese correo ya tiene una cuenta."
        : "No se pudo crear la cuenta.",
    };
  }

  const { error: perfilError } = await admin.from("users").insert({
    id: cuenta.user.id,
    tenant_id: tenantId, // del servidor, jamás del formulario
    nombre,
    email,
    rol,
    es_superadmin: false,
  });

  if (perfilError) {
    // Sin perfil la cuenta quedaría huérfana: no podría entrar a ninguna
    // óptica pero ocuparía el correo. La deshacemos.
    await admin.auth.admin.deleteUser(cuenta.user.id);
    return { ok: false, error: "No se pudo crear el perfil del usuario." };
  }

  revalidatePath("/configuracion");
  return { ok: true };
}

export async function cambiarRol(formData: FormData) {
  const { supabase, tenantId, userId } = await requerirAdmin();

  const objetivo = String(formData.get("user_id"));
  const rol = String(formData.get("rol") ?? "") as Rol;
  if (!ROLES.includes(rol)) return;

  // Si el único admin se cambia el rol a sí mismo, la óptica queda sin
  // quien administre y nadie puede revertirlo.
  if (objetivo === userId && rol !== "admin") {
    const { count } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("rol", "admin")
      .eq("estado", "activo");
    if ((count ?? 0) <= 1) return;
  }

  const { error } = await supabase.from("users").update({ rol }).eq("id", objetivo);
  if (error) throw error;
  revalidatePath("/configuracion");
}

export async function cambiarEstadoUsuario(formData: FormData) {
  const { supabase, tenantId, userId } = await requerirAdmin();

  const objetivo = String(formData.get("user_id"));
  const estado = String(formData.get("estado") ?? "activo");
  if (!["activo", "inactivo"].includes(estado)) return;

  if (objetivo === userId && estado === "inactivo") {
    const { count } = await supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("rol", "admin")
      .eq("estado", "activo");
    if ((count ?? 0) <= 1) return;
  }

  const { error } = await supabase.from("users").update({ estado }).eq("id", objetivo);
  if (error) throw error;
  revalidatePath("/configuracion");
}

export async function crearSucursal(formData: FormData) {
  const { supabase, tenantId } = await requerirAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;

  const { error } = await supabase.from("sucursales").insert({
    tenant_id: tenantId,
    nombre,
    direccion: String(formData.get("direccion") ?? "").trim() || null,
  });
  if (error) throw error;
  revalidatePath("/configuracion");
  revalidatePath("/inventario");
}

// A diferencia del resto de este archivo, esto no pasa por requerirAdmin:
// son datos personales del profesional (para el timbre en la OT impresa),
// no algo que dependa del rol. Las políticas de "users" solo dejan escribir
// al administrador, así que se usa el cliente con service role — pero el id
// sale siempre de la sesión (auth.getUser()), nunca del formulario, y solo
// se tocan estas tres columnas: cada quien edita únicamente lo suyo.
export async function actualizarPerfilProfesional(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({
      nombre,
      rut: formatearRut(String(formData.get("rut") ?? "")) || null,
      titulo_profesional: String(formData.get("titulo_profesional") ?? "").trim() || null,
      registro_profesional: String(formData.get("registro_profesional") ?? "").trim() || null,
    })
    .eq("id", user.id);

  if (error) throw error;

  revalidatePath("/configuracion");
  revalidatePath("/ot");
}

export async function actualizarOptica(formData: FormData) {
  const { supabase, tenantId } = await requerirAdmin();

  const nombre = String(formData.get("nombre_comercial") ?? "").trim();
  if (!nombre) return;

  const dias = Math.round(Number(formData.get("dias_entrega_default")));

  const { error } = await supabase
    .from("tenants")
    .update({
      nombre_comercial: nombre,
      rut_empresa: formatearRut(String(formData.get("rut_empresa") ?? "")) || null,
      telefono: formatearTelefono(String(formData.get("telefono") ?? "")) || null,
      direccion: String(formData.get("direccion") ?? "").trim() || null,
      ...(Number.isFinite(dias) && dias > 0 && dias <= 90 ? { dias_entrega_default: dias } : {}),
    })
    .eq("id", tenantId);
  if (error) throw error;
  revalidatePath("/configuracion");
  revalidatePath("/", "layout");
}
