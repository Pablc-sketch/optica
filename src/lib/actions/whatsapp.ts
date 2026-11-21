"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso, type Rol } from "@/lib/autorizacion";
import { createAdminClient } from "@/lib/supabase/admin";
import { datosDelNumero, whatsappConfigurado } from "@/lib/whatsapp-cloud";
import { analizarChat } from "@/lib/asistente/analizar-chat";
import { necesitaAnalisis, normalizarTelefonoChile, notaAprendida, type MensajeParaIA, type OperativoParaChat, type Sugerencia } from "@/lib/whatsapp-bandeja";
import { hoyEnChile } from "@/lib/fechas";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TELEFONO = /^[0-9]{8,15}$/;
const TODOS: Rol[] = ["admin", "clinico", "ventas", "bodega"];
const POR_VEZ = 8;

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
// Conexión del número
// ---------------------------------------------------------------------------

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
    return { mensaje: activo ? "Lentia vuelve a leer los chats" : "Lectura de chats en pausa" };
  });
}

// ---------------------------------------------------------------------------
// Bandeja: la IA lee los chats y propone; el administrador confirma.
// ---------------------------------------------------------------------------

// Analiza los chats con mensajes nuevos (hasta 8 por vez). Usa la sesión
// del administrador: solo puede leer chats y operativos de su óptica.
export async function analizarChats(datos?: FormData): Promise<ResultadoAgenda & { analizados?: number; quedan?: number }> {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    if (!process.env.ANTHROPIC_API_KEY) return { error: "La IA aún no está activada (falta la clave de Claude)." };
    const solo = String(datos?.get("telefono") ?? "");
    if (solo && !TELEFONO.test(solo)) return { error: "Chat no válido." };

    let consulta = supabase.from("whatsapp_chats").select("telefono, nombre_perfil, estado, ultimo_entrante_en, analizado_en")
      .eq("tenant_id", tenantId).eq("estado", "pendiente").order("ultimo_entrante_en", { ascending: false }).limit(60);
    if (solo) consulta = consulta.eq("telefono", solo);
    const chatsRes = await consulta;
    if (chatsRes.error) return { error: "No se pudieron leer los chats." };
    const pendientes = (chatsRes.data ?? []).filter((c) => solo || necesitaAnalisis(c));
    const lote = pendientes.slice(0, POR_VEZ);
    if (lote.length === 0) return { analizados: 0, quedan: 0 };

    const cupo = await supabase.rpc("registrar_pregunta_asistente", { p_cantidad: lote.length });
    if (cupo.error || cupo.data !== true) return { error: "Se alcanzó el máximo de consultas a la IA de hoy." };

    const hoy = hoyEnChile();
    const opsRes = await supabase.from("operativos").select("id, nombre, fecha, fecha_fin, comuna, direccion, sectores")
      .eq("tenant_id", tenantId).eq("estado", "planificado").or(`fecha.gte.${hoy},fecha_fin.gte.${hoy}`)
      .order("fecha").limit(40);
    if (opsRes.error) return { error: "No se pudieron leer los operativos." };
    const operativos = (opsRes.data ?? []) as OperativoParaChat[];
    const notasRes = await supabase.from("ia_conocimiento").select("texto").eq("tenant_id", tenantId).order("creado_en", { ascending: false }).limit(60);
    const notas = (notasRes.data ?? []).map((n: { texto: string }) => n.texto).reverse();

    const client = new Anthropic({ maxRetries: 1, timeout: 60_000 });
    const resultados = await Promise.allSettled(lote.map(async (c) => {
      const m = await supabase.from("whatsapp_mensajes").select("direccion, texto, enviado_en")
        .eq("tenant_id", tenantId).eq("telefono", c.telefono).order("enviado_en", { ascending: false }).limit(30);
      if (m.error) throw new Error("mensajes");
      const mensajes = ((m.data ?? []) as MensajeParaIA[]).reverse();
      const sugerencia = await analizarChat(client, operativos, mensajes, c.nombre_perfil, notas);
      const u = await supabase.from("whatsapp_chats").update({ sugerencia, analizado_en: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("telefono", c.telefono);
      if (u.error) throw new Error("guardar");
    }));
    const analizados = resultados.filter((r) => r.status === "fulfilled").length;
    revalidatePath("/whatsapp");
    if (analizados === 0) return { error: "La IA no respondió. Reintenta en un momento." };
    return { mensaje: `${analizados} chat${analizados === 1 ? "" : "s"} revisado${analizados === 1 ? "" : "s"}`, analizados, quedan: pendientes.length - analizados };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

// Confirmar la sugerencia (o corregirla) e inscribir. Un mismo WhatsApp
// puede inscribir a varias personas (filas nombre_N / edad_N): todas con
// el teléfono de ese chat.
export async function inscribirDesdeChat(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId, user }) => {
    const telefono = String(datos.get("telefono") ?? "");
    const operativo = String(datos.get("operativo_id") ?? "");
    if (!TELEFONO.test(telefono) || !UUID.test(operativo)) return { error: "Elige el operativo." };
    const personas: { nombre: string; edad: number | null }[] = [];
    for (let i = 0; i < 8; i++) {
      const nombre = String(datos.get(`nombre_${i}`) ?? "").replace(/\s+/g, " ").trim();
      if (!nombre) continue;
      const edad = edadDe(datos.get(`edad_${i}`));
      if (nombre.length < 2 || nombre.length > 80) return { error: `Revisa el nombre «${nombre}».` };
      if (edad === undefined) return { error: `La edad de ${nombre} debe ser un número entre 0 y 120.` };
      personas.push({ nombre, edad });
    }
    if (personas.length === 0) return { error: "Escribe el nombre de al menos una persona." };
    const r = await supabase.from("inscritos_operativo").insert(personas.map((p) => ({
      tenant_id: tenantId, operativo_id: operativo, nombre: p.nombre, telefono, edad: p.edad, origen: "whatsapp", creado_por: user.id,
    })));
    if (r.error) return { error: r.error.code === "23505" ? "Alguna de esas personas ya está inscrita en ese operativo." : "No se pudo inscribir." };
    const chat = await supabase.from("whatsapp_chats").update({ estado: "inscrito" }).eq("tenant_id", tenantId).eq("telefono", telefono)
      .select("sugerencia").maybeSingle();
    await aprender(supabase, tenantId, user.id, (chat.data?.sugerencia as Sugerencia | null)?.sector ?? null, operativo);
    revalidatePath("/whatsapp");
    revalidatePath(`/operativos/${operativo}`);
    return { mensaje: personas.length === 1 ? `${personas[0].nombre} inscrito` : `${personas.length} personas inscritas` };
  });
}

// La IA aprende: el sector que dijo la persona corresponde a ese lugar.
// Así reconoce sola a los próximos que digan lo mismo.
async function aprender(supabase: Awaited<ReturnType<typeof requerirPerfil>>["supabase"], tenantId: string, usuario: string, sector: string | null, operativoId: string) {
  if (!sector) return;
  const [op, notas] = await Promise.all([
    supabase.from("operativos").select("nombre, comuna").eq("id", operativoId).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("ia_conocimiento").select("texto").eq("tenant_id", tenantId).limit(200),
  ]);
  if (!op.data) return;
  const nota = notaAprendida(sector, op.data, (notas.data ?? []).map((n: { texto: string }) => n.texto));
  if (nota) await supabase.from("ia_conocimiento").insert({ tenant_id: tenantId, texto: nota, origen: "aprendido", creado_por: usuario });
}

// Respuesta a «¿es de esa sede?» para una persona que la IA dejó por
// confirmar. Sí: queda inscrita (con lo que se haya corregido). No: se quita
// y el chat vuelve a la bandeja.
export async function confirmarPreinscrito(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId, user }) => {
    const id = String(datos.get("id") ?? "");
    const si = datos.get("respuesta") === "si";
    if (!UUID.test(id)) return { error: "No válido." };
    const pre = await supabase.from("inscritos_operativo").select("telefono, operativo_id, sector, nombre, edad")
      .eq("id", id).eq("tenant_id", tenantId).eq("estado", "por_confirmar").maybeSingle();
    if (pre.error || !pre.data) return { error: "Ya fue respondida." };
    if (!si) {
      await supabase.from("inscritos_operativo").update({ estado: "cancelado" }).eq("id", id).eq("tenant_id", tenantId);
      revalidatePath("/whatsapp");
      revalidatePath(`/operativos/${pre.data.operativo_id}`);
      return { mensaje: "Quitada. El chat sigue en la bandeja." };
    }
    const operativo = String(datos.get("operativo_id") ?? pre.data.operativo_id);
    const nombre = String(datos.get("nombre") ?? pre.data.nombre).replace(/\s+/g, " ").trim();
    const edad = datos.has("edad") ? edadDe(datos.get("edad")) : pre.data.edad;
    if (!UUID.test(operativo)) return { error: "Elige el operativo." };
    if (nombre.length < 2 || nombre.length > 80) return { error: "Escribe el nombre." };
    if (edad === undefined) return { error: "La edad debe ser un número entre 0 y 120." };
    const r = await supabase.from("inscritos_operativo").update({ estado: "inscrito", operativo_id: operativo, nombre, edad })
      .eq("id", id).eq("tenant_id", tenantId).select("id").single();
    if (r.error) return { error: r.error.code === "23505" ? "Esa persona ya está inscrita en ese operativo." : "No se pudo confirmar." };
    await supabase.from("whatsapp_chats").update({ estado: "inscrito" }).eq("tenant_id", tenantId).eq("telefono", pre.data.telefono);
    await aprender(supabase, tenantId, user.id, pre.data.sector, operativo);
    revalidatePath("/whatsapp");
    revalidatePath(`/operativos/${operativo}`);
    return { mensaje: `${nombre} inscrito` };
  });
}

export async function cambiarAutomatico(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ tenantId }) => {
    const automatico = datos.get("automatico") === "on";
    const r = await createAdminClient().from("whatsapp_numeros").update({ automatico }).eq("tenant_id", tenantId).select("tenant_id").single();
    if (r.error) return { error: "No se pudo cambiar." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: automatico ? "La IA revisará sola los chats nuevos" : "Revisión automática apagada" };
  });
}

export async function descartarChat(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId }) => {
    const telefono = String(datos.get("telefono") ?? "");
    if (!TELEFONO.test(telefono)) return { error: "Chat no válido." };
    const r = await supabase.from("whatsapp_chats").update({ estado: "descartado" }).eq("tenant_id", tenantId).eq("telefono", telefono);
    if (r.error) return { error: "No se pudo cambiar." };
    revalidatePath("/whatsapp");
    return { mensaje: "Descartado" };
  });
}

// ---------------------------------------------------------------------------
// Inscritos en el operativo
// ---------------------------------------------------------------------------
export async function inscribirManual(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(TODOS, async ({ supabase, tenantId, user }) => {
    const operativo = String(datos.get("operativo_id") ?? "");
    const nombre = String(datos.get("nombre") ?? "").replace(/\s+/g, " ").trim();
    const telefono = normalizarTelefonoChile(String(datos.get("telefono") ?? ""));
    const edad = edadDe(datos.get("edad"));
    if (!UUID.test(operativo)) return { error: "Operativo no válido." };
    if (nombre.length < 2 || nombre.length > 80) return { error: "Escribe el nombre." };
    if (!telefono) return { error: "Revisa el teléfono (ej. 9 1234 5678)." };
    if (edad === undefined) return { error: "La edad debe ser un número entre 0 y 120." };
    const r = await supabase.from("inscritos_operativo").insert({ tenant_id: tenantId, operativo_id: operativo, nombre, telefono, edad, origen: "manual", creado_por: user.id });
    if (r.error) return { error: r.error.code === "23505" ? "Esa persona ya está inscrita en este operativo (mismo nombre y teléfono)." : "No se pudo inscribir." };
    revalidatePath(`/operativos/${operativo}`);
    return { mensaje: `${nombre} inscrito` };
  });
}

export async function cambiarInscrito(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(TODOS, async ({ supabase, tenantId }) => {
    const id = String(datos.get("id") ?? "");
    const estado = String(datos.get("estado") ?? "");
    if (!UUID.test(id) || !["inscrito", "cancelado", "asistio"].includes(estado)) return { error: "Acción no válida." };
    const r = await supabase.from("inscritos_operativo").update({ estado }).eq("id", id).eq("tenant_id", tenantId).select("operativo_id").single();
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
