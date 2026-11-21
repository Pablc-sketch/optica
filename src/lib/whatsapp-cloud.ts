import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// WhatsApp Cloud API (Meta), en coexistencia con la app WhatsApp Business:
// la óptica sigue usando su WhatsApp Business en el celular y Lentia recibe
// una copia de los mensajes nuevos. Lentia NUNCA envía mensajes ni llama.
// Variables (se cargan en Vercel, nunca en el código ni por chat):
//   NEXT_PUBLIC_META_APP_ID     identificador de la app de Meta (público)
//   NEXT_PUBLIC_META_CONFIG_ID  configuración de «Facebook Login for Business» (pública)
//   WHATSAPP_APP_SECRET         secreto de la app: firma de avisos y canje del código
//   WHATSAPP_VERIFY_TOKEN       texto que se pega en Meta al registrar el webhook
//   WHATSAPP_ACCESS_TOKEN       (opcional) solo para conectar un número a mano

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v27.0";
const VERSION = GRAPH_VERSION;

// Lo necesario para recibir avisos de Meta.
export function webhookConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_VERIFY_TOKEN);
}

// Lo necesario para el alta oficial (Embedded Signup) desde Lentia.
export function altaMetaConfigurada(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_APP_ID && process.env.NEXT_PUBLIC_META_CONFIG_ID && webhookConfigurado());
}

// Conexión manual con un token de sistema (camino alternativo).
export function whatsappConfigurado(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && webhookConfigurado());
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

// Comprueba que el token puede usar ese número y devuelve cómo se ve.
export async function datosDelNumero(phoneNumberId: string, token = process.env.WHATSAPP_ACCESS_TOKEN): Promise<{ telefono: string; nombre: string } | null> {
  if (!token || !/^[0-9]{5,30}$/.test(phoneNumberId)) return null;
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as { display_phone_number?: string; verified_name?: string } | null;
  return d?.display_phone_number ? { telefono: d.display_phone_number.slice(0, 30), nombre: (d.verified_name ?? "").slice(0, 100) } : null;
}

// ---------------------------------------------------------------------------
// Alta oficial (Embedded Signup v5, coexistencia). Pasos de servidor según
// Meta: canjear el código por un token del negocio y suscribir la app a la
// cuenta de WhatsApp (subscribed_apps). NO se llama a /register (el número
// ya está registrado en la app) ni a smb_app_data (no se importan contactos
// ni historial). El token no se guarda: solo se usa en este momento.
// ---------------------------------------------------------------------------
const ID_META = /^[0-9]{5,30}$/;

export async function canjearCodigo(code: string): Promise<string | null> {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID;
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !secreto || !code || code.length > 2000) return null;
  const url = new URL(`https://graph.facebook.com/${VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", secreto);
  url.searchParams.set("code", code);
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return null;
  const d = (await r.json().catch(() => null)) as { access_token?: unknown } | null;
  return typeof d?.access_token === "string" ? d.access_token : null;
}

export async function suscribirCuenta(wabaId: string, token: string): Promise<boolean> {
  if (!ID_META.test(wabaId)) return false;
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!r?.ok) return false;
  const d = (await r.json().catch(() => null)) as { success?: unknown } | null;
  return d?.success === true;
}

// ---------------------------------------------------------------------------
// Lectura de avisos
// ---------------------------------------------------------------------------
export type MensajeChat = {
  phoneNumberId: string;
  // Teléfono de la PERSONA (no el de la óptica), en ambos sentidos.
  telefono: string;
  nombrePerfil: string | null;
  wamid: string;
  direccion: "entrante" | "saliente";
  texto: string;
  enviadoEn: string;
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const DESCRIPCION_TIPO: Record<string, string> = {
  image: "[foto]", audio: "[audio]", video: "[video]", document: "[documento]", sticker: "[sticker]",
  location: "[ubicación]", contacts: "[contacto]", reaction: "[reacción]",
};

function textoDe(m: Obj): string {
  const tipo = String(m.type ?? "");
  if (tipo === "text") return String(obj(m.text).body ?? "");
  if (tipo === "interactive") {
    const i = obj(m.interactive);
    return String(obj(i.list_reply).title ?? obj(i.button_reply).title ?? "");
  }
  if (tipo === "button") return String(obj(m.button).text ?? "");
  if (tipo === "location") {
    const l = obj(m.location);
    return ["[ubicación]", l.name, l.address].filter(Boolean).join(" ");
  }
  const caption = obj(m[tipo]).caption;
  return [DESCRIPCION_TIPO[tipo] ?? `[${tipo || "mensaje"}]`, typeof caption === "string" ? caption : ""].filter(Boolean).join(" ");
}

function fechaDe(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 1e9 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

function mensaje(phoneNumberId: string, m: Obj, direccion: "entrante" | "saliente", telefono: unknown, nombres: Map<string, string>): MensajeChat | null {
  if (typeof telefono !== "string" || !/^[0-9]{8,15}$/.test(telefono) || typeof m.id !== "string") return null;
  return {
    phoneNumberId,
    telefono,
    nombrePerfil: nombres.get(telefono) ?? null,
    wamid: m.id.slice(0, 200),
    direccion,
    texto: textoDe(m).slice(0, 4000),
    enviadoEn: fechaDe(m.timestamp),
  };
}

// Junta los mensajes NUEVOS de un aviso de Meta:
//  - messages: lo que escriben las personas,
//  - smb_message_echoes: lo que la óptica responde desde la app.
// «history» y «smb_app_state_sync» (historial y agenda) se ignoran a
// propósito: Lentia no importa el historial ni los contactos. Mensajes sin
// número de teléfono (solo identificador de usuario de Meta) se saltan:
// sin teléfono no hay a quién llamar.
export function mensajesDelAviso(aviso: unknown): MensajeChat[] {
  const out: MensajeChat[] = [];
  for (const e of lista(obj(aviso).entry)) {
    for (const c of lista(obj(e).changes)) {
      const campo = obj(c).field;
      const v = obj(obj(c).value);
      const phoneNumberId = obj(v.metadata).phone_number_id;
      if (typeof phoneNumberId !== "string") continue;
      const nombres = new Map<string, string>();
      for (const k of lista(v.contacts)) {
        const wa = obj(k).wa_id;
        const nombre = obj(obj(k).profile).name;
        if (typeof wa === "string" && typeof nombre === "string") nombres.set(wa, nombre.slice(0, 100));
      }
      if (campo === "messages") {
        for (const m of lista(v.messages)) {
          const x = mensaje(phoneNumberId, obj(m), "entrante", obj(m).from, nombres);
          if (x) out.push(x);
        }
      } else if (campo === "smb_message_echoes") {
        for (const m of lista(v.message_echoes)) {
          const x = mensaje(phoneNumberId, obj(m), "saliente", obj(m).to, nombres);
          if (x) out.push(x);
        }
      }
    }
  }
  return out;
}
