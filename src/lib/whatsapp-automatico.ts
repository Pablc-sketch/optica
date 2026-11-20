import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analizarChat } from "@/lib/asistente/analizar-chat";
import { type MensajeParaIA, type OperativoParaChat, type Sugerencia } from "@/lib/whatsapp-bandeja";
import { hoyEnChile } from "@/lib/fechas";

// Revisión automática de un chat de WhatsApp, sin que el administrador abra
// Lentia: la IA lee el chat y, si la persona quiere atenderse y dice una
// sede o localidad que calza con un operativo, la deja PREINSCRITA (por
// confirmar) en ese operativo y avisa por correo al administrador. Nunca le
// responde a la persona y nunca deja a nadie inscrito sin el sí del
// administrador. Trabaja con la llave de servicio, siempre filtrando por la
// óptica dueña del número que recibió el mensaje.

// Espera antes de revisar, por si la persona manda varios mensajes seguidos.
export const ESPERA_MS = 20_000;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function debePreinscribir(s: Sugerencia | null, nombrePerfil: string | null): { nombre: string } | null {
  if (!s || !s.quiere_atenderse || !s.operativo_id || s.confianza === "baja") return null;
  const nombre = (s.nombre ?? nombrePerfil ?? "").replace(/\s+/g, " ").trim();
  return nombre.length >= 2 ? { nombre: nombre.slice(0, 80) } : null;
}

export async function revisarChatAutomatico(db: SupabaseClient, tenant: string, telefono: string, wamid: string, espera = ESPERA_MS) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  await dormir(espera);

  // Solo revisa el último mensaje de la persona (los anteriores se saltan).
  const ultimo = await db.from("whatsapp_mensajes").select("wamid").eq("tenant_id", tenant).eq("telefono", telefono)
    .eq("direccion", "entrante").order("enviado_en", { ascending: false }).limit(1).maybeSingle();
  if (ultimo.data?.wamid !== wamid) return;

  const chat = await db.from("whatsapp_chats").select("nombre_perfil, estado").eq("tenant_id", tenant).eq("telefono", telefono).maybeSingle();
  if (!chat.data || chat.data.estado !== "pendiente") return;

  const hoy = hoyEnChile();
  const opsRes = await db.from("operativos").select("id, nombre, fecha, fecha_fin, comuna, direccion, sectores")
    .eq("tenant_id", tenant).eq("estado", "planificado").or(`fecha.gte.${hoy},fecha_fin.gte.${hoy}`).order("fecha").limit(40);
  const operativos = (opsRes.data ?? []) as OperativoParaChat[];
  if (opsRes.error || operativos.length === 0) return;

  // Si ya está anotada en un operativo próximo, no se vuelve a proponer.
  const ya = await db.from("inscritos_operativo").select("id").eq("tenant_id", tenant).eq("telefono", telefono)
    .neq("estado", "cancelado").in("operativo_id", operativos.map((o) => o.id)).limit(1);
  if ((ya.data ?? []).length > 0) return;

  const cupo = await db.rpc("registrar_consulta_ia_servicio", { p_tenant: tenant, p_cantidad: 1 });
  if (cupo.error || cupo.data !== true) return;

  const [mensajesRes, notasRes] = await Promise.all([
    db.from("whatsapp_mensajes").select("direccion, texto, enviado_en").eq("tenant_id", tenant).eq("telefono", telefono)
      .order("enviado_en", { ascending: false }).limit(30),
    db.from("ia_conocimiento").select("texto").eq("tenant_id", tenant).order("creado_en", { ascending: false }).limit(60),
  ]);
  const mensajes = ((mensajesRes.data ?? []) as MensajeParaIA[]).reverse();
  const notas = (notasRes.data ?? []).map((n: { texto: string }) => n.texto).reverse();

  const client = new Anthropic({ maxRetries: 1, timeout: 30_000 });
  const sugerencia = await analizarChat(client, operativos, mensajes, chat.data.nombre_perfil, notas);
  await db.from("whatsapp_chats").update({ sugerencia, analizado_en: new Date().toISOString() }).eq("tenant_id", tenant).eq("telefono", telefono);

  const pre = debePreinscribir(sugerencia, chat.data.nombre_perfil);
  if (!pre || !sugerencia?.operativo_id) return;
  const r = await db.from("inscritos_operativo").insert({
    tenant_id: tenant, operativo_id: sugerencia.operativo_id, nombre: pre.nombre, telefono, edad: sugerencia.edad,
    estado: "por_confirmar", origen: "whatsapp", sector: sugerencia.sector, motivo: sugerencia.motivo,
  });
  if (r.error) return; // duplicado u otro: queda en la bandeja como sugerencia
  const op = operativos.find((o) => o.id === sugerencia.operativo_id)!;
  await avisarPorCorreo(db, tenant, `${pre.nombre}${sugerencia.edad !== null ? ` (${sugerencia.edad} años)` : ""}`, op, sugerencia);
}

// Correo al administrador: quién, qué dijo y a qué operativo; sin teléfono.
async function avisarPorCorreo(db: SupabaseClient, tenant: string, persona: string, op: OperativoParaChat, s: Sugerencia) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const admins = await db.from("users").select("email").eq("tenant_id", tenant).eq("rol", "admin").eq("estado", "activo").limit(5);
  const para = (admins.data ?? []).map((u: { email: string | null }) => u.email).filter((e): e is string => Boolean(e));
  if (para.length === 0) return;
  const url = `${process.env.LENTIA_URL || "https://lentiaapp.cl"}/whatsapp?ver=por_confirmar`;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  try {
    await new Resend(apiKey).emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Lentia <onboarding@resend.dev>",
    to: para,
    subject: `Por confirmar: ${persona} → ${op.nombre}`,
    html: `<p><b>${esc(persona)}</b> escribió por WhatsApp${s.sector ? ` y dice que es de <b>${esc(s.sector)}</b>` : ""}.</p>
<p>Lentia la dejó preinscrita en <b>${esc(op.nombre)}</b> (${esc(op.fecha)}). ${esc(s.motivo)}</p>
<p><a href="${url}">¿Es de esa sede? Confirmar o rechazar en Lentia</a></p>`,
    });
  } catch {
    // Sin correo la preinscripción igual queda en Lentia por confirmar.
  }
}
