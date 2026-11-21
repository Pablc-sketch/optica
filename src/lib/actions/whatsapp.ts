"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso, type Rol } from "@/lib/autorizacion";
import { createAdminClient } from "@/lib/supabase/admin";
import { altaMetaConfigurada, canjearCodigo, datosDelNumero, suscribirCuenta, whatsappConfigurado } from "@/lib/whatsapp-cloud";
import { normalizarTelefonoChile } from "@/lib/whatsapp-inscripcion";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";
import { inscribir } from "@/lib/inscritos";

// WhatsApp Business de la óptica. Lentia nunca envía mensajes ni llama:
// recibe copia de los mensajes nuevos, sugiere inscripciones y el
// administrador las aprueba. Nada de los chats se manda a servicios de IA.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_META = /^[0-9]{5,30}$/;
// Inscritos: quienes atienden el operativo (igual que en la base).
const EQUIPO: Rol[] = ["admin", "ventas"];

async function conPerfil(roles: Rol[], f: (ctx: Awaited<ReturnType<typeof requerirPerfil>>) => Promise<ResultadoAgenda>): Promise<ResultadoAgenda> {
  try {
    return await f(await requerirPerfil({ roles, suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

const edadDe = (v: FormDataEntryValue | null): number | null | undefined => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 120 ? n : undefined;
};

// ---------------------------------------------------------------------------
// Alta oficial de Meta (Embedded Signup v5) en modo coexistencia: el número
// sigue en la app WhatsApp Business del celular. Meta ya verificó en su
// ventana que la persona controla el número; aquí se canjea el código, se
// suscriben los avisos de esa cuenta y se guardan solo los identificadores.
// No se registra el número de nuevo, no se importan contactos ni historial
// y no se guarda ningún token.
// ---------------------------------------------------------------------------
export async function completarAltaMeta(input: {
  code: string; phoneNumberId: string; wabaId: string; businessId?: string | null; enApp: boolean;
}): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ tenantId }) => {
    if (!altaMetaConfigurada()) return { error: "Falta configurar la app de Meta en el servidor." };
    if (!input || typeof input.code !== "string" || !ID_META.test(String(input.phoneNumberId)) || !ID_META.test(String(input.wabaId))) {
      return { error: "Meta no devolvió los datos del número. Vuelve a intentarlo." };
    }
    if (input.businessId && !ID_META.test(String(input.businessId))) return { error: "Datos de Meta no válidos." };
    if (input.enApp !== true) {
      return { error: "Ese número no se conectó desde la app WhatsApp Business. Lentia solo acepta la conexión que mantiene el WhatsApp del celular (coexistencia)." };
    }
    const token = await canjearCodigo(input.code);
    if (!token) return { error: "Meta no aceptó el código (vence en 5 minutos). Vuelve a conectar." };
    const numero = await datosDelNumero(input.phoneNumberId, token);
    if (!numero) return { error: "Meta no permitió leer ese número. Revisa los permisos de la app." };
    if (!(await suscribirCuenta(input.wabaId, token))) return { error: "No se pudieron activar los avisos de mensajes en Meta." };
    const r = await createAdminClient().from("whatsapp_numeros").upsert({
      tenant_id: tenantId, phone_number_id: input.phoneNumberId, waba_id: input.wabaId, business_id: input.businessId || null,
      telefono_visible: numero.telefono, coexistencia: true, activo: true, conectado_en: new Date().toISOString(),
    }, { onConflict: "tenant_id" });
    if (r.error) return { error: r.error.code === "23505" ? "Ese número ya está conectado a otra óptica." : "No se pudo guardar la conexión." };
    revalidatePath("/configuracion/integraciones");
    revalidatePath("/whatsapp");
    return { mensaje: `Conectado: ${numero.telefono}${numero.nombre ? ` (${numero.nombre})` : ""}. Tu WhatsApp Business sigue en el celular.` };
  });
}

// Conexión manual (alternativa, con token de sistema de Meta).
// Antes de guardar se pregunta a Meta si el token de Lentia puede usar ese
// número: así nadie puede anotar el número de otra óptica.
export async function conectarWhatsapp(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId, user }) => {
    const id = String(datos.get("phone_number_id") ?? "").replace(/\D/g, "");
    if (!/^[0-9]{5,30}$/.test(id)) return { error: "Pega el «Identificador del número de teléfono» que muestra Meta (solo números)." };
    if (!whatsappConfigurado()) return { error: "Falta activar WhatsApp en el servidor (claves de Meta en Vercel)." };
    const perfil = await supabase.from("users").select("es_superadmin").eq("id", user.id).single();
    if (!perfil.data?.es_superadmin) return { error: "Pide a Lentia que conecte el número de tu óptica." };
    const numero = await datosDelNumero(id);
    if (!numero) return { error: "Meta no reconoce ese número para la app de Lentia. Revisa el identificador y que el número esté conectado." };
    const r = await createAdminClient()
      .from("whatsapp_numeros")
      .upsert({ tenant_id: tenantId, phone_number_id: id, telefono_visible: numero.telefono, activo: true }, { onConflict: "tenant_id" });
    if (r.error) return { error: r.error.code === "23505" ? "Ese número ya está conectado a otra óptica." : "No se pudo guardar el número." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: `Conectado: ${numero.telefono}${numero.nombre ? ` (${numero.nombre})` : ""}` };
  });
}

export async function pausarWhatsapp(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ tenantId }) => {
    const activo = datos.get("activo") === "on";
    const r = await createAdminClient().from("whatsapp_numeros").update({ activo }).eq("tenant_id", tenantId).select("tenant_id").single();
    if (r.error) return { error: "No se pudo cambiar." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: activo ? "Lentia vuelve a recibir los mensajes" : "Recepción de mensajes en pausa" };
  });
}

export async function cambiarAutomatico(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ tenantId }) => {
    const automatico = datos.get("automatico") === "on";
    const r = await createAdminClient().from("whatsapp_numeros").update({ automatico }).eq("tenant_id", tenantId).select("tenant_id").single();
    if (r.error) return { error: "No se pudo cambiar." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: automatico ? "Lentia sugerirá inscripciones de los mensajes nuevos" : "Sugerencias automáticas apagadas" };
  });
}

// ---------------------------------------------------------------------------
// «Por confirmar»: aprobar pasa la sugerencia a la lista para llamar.
// ---------------------------------------------------------------------------
export async function aprobarSugerencia(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase }) => {
    const id = String(datos.get("id") ?? "");
    const operativo = String(datos.get("operativo_id") ?? "");
    if (!UUID.test(id)) return { error: "Sugerencia no válida." };
    if (!UUID.test(operativo)) return { error: "Elige la sede y fecha del operativo." };
    const nombres: string[] = [];
    const edades: (number | null)[] = [];
    for (let i = 0; i < 8; i++) {
      const nombre = String(datos.get(`nombre_${i}`) ?? "").replace(/\s+/g, " ").trim();
      if (!nombre) continue;
      const edad = edadDe(datos.get(`edad_${i}`));
      if (nombre.length < 2 || nombre.length > 80) return { error: `Revisa el nombre «${nombre}».` };
      if (edad === undefined) return { error: `La edad de ${nombre} debe ser un número entre 0 y 120.` };
      nombres.push(nombre);
      edades.push(edad);
    }
    if (nombres.length === 0) return { error: "Escribe el nombre de la persona." };
    const r = await supabase.rpc("aprobar_sugerencia_whatsapp", { p_sugerencia: id, p_operativo: operativo, p_nombres: nombres, p_edades: edades });
    if (r.error) return { error: r.error.code === "P0001" || r.error.code === "P0002" ? r.error.message : "No se pudo aprobar." };
    revalidatePath("/whatsapp");
    revalidatePath(`/operativos/${operativo}`);
    const n = Number(r.data ?? 0);
    return { mensaje: n === 0 ? "Ya estaba en la lista." : n === 1 ? `${nombres[0]} quedó en la lista para llamar` : `${n} personas quedaron en la lista para llamar` };
  });
}

export async function descartarSugerencia(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId, user }) => {
    const id = String(datos.get("id") ?? "");
    if (!UUID.test(id)) return { error: "Sugerencia no válida." };
    const r = await supabase.from("whatsapp_sugerencias")
      .update({ estado: "descartada", resuelto_por: user.id, resuelto_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
      .eq("id", id).eq("tenant_id", tenantId).eq("estado", "pendiente").select("id");
    if (r.error) return { error: "No se pudo descartar." };
    revalidatePath("/whatsapp");
    return { mensaje: (r.data ?? []).length ? "Descartada" : "Ya estaba resuelta." };
  });
}

// ---------------------------------------------------------------------------
// Inscritos en el operativo
// ---------------------------------------------------------------------------
export async function inscribirManual(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(EQUIPO, async ({ supabase, tenantId, user }) => {
    const operativo = String(datos.get("operativo_id") ?? "");
    const nombre = String(datos.get("nombre") ?? "").replace(/\s+/g, " ").trim();
    const telefono = normalizarTelefonoChile(String(datos.get("telefono") ?? ""));
    const edad = edadDe(datos.get("edad"));
    if (!UUID.test(operativo)) return { error: "Operativo no válido." };
    if (nombre.length < 2 || nombre.length > 80) return { error: "Escribe el nombre." };
    if (!telefono) return { error: "Revisa el teléfono (ej. 9 1234 5678)." };
    if (edad === undefined) return { error: "La edad debe ser un número entre 0 y 120." };
    const [r] = await inscribir(supabase, [{ tenant_id: tenantId, operativo_id: operativo, nombre, telefono, edad, estado: "inscrito", origen: "manual", creado_por: user.id }]);
    if (!r.ok) return { error: r.repetida ? "Esa persona ya está inscrita en este operativo (mismo nombre y teléfono)." : "No se pudo inscribir." };
    revalidatePath(`/operativos/${operativo}`);
    return { mensaje: `${nombre} inscrito` };
  });
}

// Llegó / no llegó / quitar / volver a inscribir.
const ACCIONES: Record<string, Record<string, unknown>> = {
  llego: { llego: true }, no_llego: { llego: false }, quitar: { estado: "cancelado" }, reactivar: { estado: "inscrito" },
};
export async function cambiarInscrito(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(EQUIPO, async ({ supabase, tenantId }) => {
    const id = String(datos.get("id") ?? "");
    const cambio = ACCIONES[String(datos.get("accion") ?? "")];
    if (!UUID.test(id) || !cambio) return { error: "Acción no válida." };
    const r = await supabase.from("inscritos_operativo").update(cambio).eq("id", id).eq("tenant_id", tenantId).select("operativo_id").single();
    if (r.error) return { error: r.error.code === "23505" ? "Esa persona ya está inscrita de nuevo en este operativo." : "No se pudo cambiar." };
    revalidatePath(`/operativos/${r.data.operativo_id}`);
    return { mensaje: "Listo" };
  });
}

export async function guardarSectores(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId }) => {
    const id = String(datos.get("operativo_id") ?? "");
    const sectores = String(datos.get("sectores") ?? "").replace(/\s+/g, " ").trim().slice(0, 500) || null;
    if (!UUID.test(id)) return { error: "Operativo no válido." };
    const r = await supabase.from("operativos").update({ sectores }).eq("id", id).eq("tenant_id", tenantId).select("id").single();
    if (r.error) return { error: "No se pudo guardar." };
    revalidatePath(`/operativos/${id}`);
    return { mensaje: "Guardado" };
  });
}
