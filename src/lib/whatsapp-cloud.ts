import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API (Meta). Lentia tiene UNA app de Meta; cada óptica
// conecta su número y se identifica por su phone_number_id.
//   WHATSAPP_ACCESS_TOKEN  token de usuario del sistema con acceso a los números
//   WHATSAPP_APP_SECRET    para comprobar que el aviso viene de Meta
//   WHATSAPP_VERIFY_TOKEN  texto que se pega en Meta al registrar el webhook

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}

// Meta firma el cuerpo con el secreto de la app: X-Hub-Signature-256.
export function firmaValida(cuerpo: string, firma: string | null, secreto = process.env.WHATSAPP_APP_SECRET): boolean {
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperada = Buffer.from("sha256=" + createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex"));
  const recibida = Buffer.from(firma);
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

export function tokenVerificacionValido(recibido: string | null, esperado = process.env.WHATSAPP_VERIFY_TOKEN): boolean {
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function enviarTexto(phoneNumberId: string, para: string, texto: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return false;
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto.slice(0, 4000) } }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  return Boolean(r?.ok);
}

// Comprueba que el token de Lentia puede usar ese número y devuelve cómo se ve.
export async function datosDelNumero(phoneNumberId: string): Promise<{ telefono: string; nombre: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !/^[0-9]{5,30}$/.test(phoneNumberId)) return null;
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string } | null;
  return d?.display_phone_number ? { telefono: d.display_phone_number.slice(0, 30), nombre: (d.verified_name ?? "").slice(0, 100) } : null;
}

// Lo que importa de un aviso de Meta: mensajes de texto entrantes.
export type MensajeEntrante = { phoneNumberId: string; de: string; wamid: string; texto: string };

export function mensajesDelAviso(aviso: unknown): MensajeEntrante[] {
  const out: MensajeEntrante[] = [];
  const entradas = (aviso as { entry?: unknown })?.entry;
  if (!Array.isArray(entradas)) return out;
  for (const e of entradas) {
    const cambios = (e as { changes?: unknown })?.changes;
    if (!Array.isArray(cambios)) continue;
    for (const c of cambios) {
      const v = (c as { field?: unknown; value?: Record<string, unknown> })?.field === "messages" ? (c as { value?: Record<string, unknown> }).value : undefined;
      const phoneNumberId = (v?.metadata as { phone_number_id?: unknown } | undefined)?.phone_number_id;
      if (typeof phoneNumberId !== "string" || !Array.isArray(v?.messages)) continue;
      for (const m of v.messages as Record<string, unknown>[]) {
        const texto =
          m.type === "text" ? (m.text as { body?: unknown })?.body
          : m.type === "interactive" ? ((m.interactive as { list_reply?: { title?: unknown }; button_reply?: { title?: unknown } })?.list_reply?.title
            ?? (m.interactive as { button_reply?: { title?: unknown } })?.button_reply?.title)
          : m.type === "button" ? (m.button as { text?: unknown })?.text
          : undefined;
        if (typeof m.from === "string" && typeof m.id === "string") {
          out.push({ phoneNumberId, de: m.from, wamid: m.id, texto: typeof texto === "string" ? texto.slice(0, 1000) : "" });
        }
      }
    }
  }
  return out;
}
