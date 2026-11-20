import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarTexto, firmaValida, mensajesDelAviso, tokenVerificacionValido, type MensajeEntrante } from "@/lib/whatsapp-cloud";
import { leerEstado, responder, telefonoValido, type Estado, type Fuente } from "@/lib/whatsapp-agenda";

// Webhook de WhatsApp Cloud API. Meta llama acá cada vez que alguien le
// escribe al WhatsApp de una óptica conectada.
//  - GET: Meta comprueba el webhook al registrarlo (hub.verify_token).
//  - POST: mensajes. Se acepta solo con la firma de Meta. La óptica sale del
//    número que recibió el mensaje (whatsapp_numeros), nunca del contenido;
//    todo lo que se lee o escribe pasa por funciones de la base que exigen
//    esa óptica.

export const runtime = "nodejs";
export const maxDuration = 60;

const VIGENCIA_ESTADO_MS = 30 * 60 * 1000;

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  if (p.get("hub.mode") === "subscribe" && tokenVerificacionValido(p.get("hub.verify_token"))) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Prohibido", { status: 403 });
}

export async function POST(request: Request) {
  const cuerpo = await request.text();
  if (!firmaValida(cuerpo, request.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }
  let aviso: unknown;
  try {
    aviso = JSON.parse(cuerpo);
  } catch {
    return new Response("ok", { status: 200 });
  }
  const mensajes = mensajesDelAviso(aviso);
  // Meta espera respuesta rápida; el trabajo sigue después de contestar.
  if (mensajes.length > 0) after(() => procesar(mensajes));
  return new Response("ok", { status: 200 });
}

async function procesar(mensajes: MensajeEntrante[]) {
  const db = createAdminClient();
  for (const m of mensajes.slice(0, 20)) {
    try {
      await procesarUno(db, m);
    } catch (e) {
      console.error("whatsapp: no se pudo procesar un mensaje", e instanceof Error ? e.message : "error");
    }
  }
}

async function procesarUno(db: ReturnType<typeof createAdminClient>, m: MensajeEntrante) {
  const telefono = telefonoValido(m.de);
  if (!telefono) return;
  const numero = await db
    .from("whatsapp_numeros")
    .select("tenant_id, activo, tenants:tenant_id (nombre_comercial)")
    .eq("phone_number_id", m.phoneNumberId)
    .maybeSingle();
  if (numero.error || !numero.data?.activo) return;
  const tenant = numero.data.tenant_id as string;
  const optica = (numero.data.tenants as unknown as { nombre_comercial?: string } | null)?.nombre_comercial || "la óptica";

  // Meta reintenta los avisos: cada mensaje se procesa una sola vez.
  const nuevo = await db.from("whatsapp_mensajes_procesados").insert({ wamid: m.wamid.slice(0, 200) });
  if (nuevo.error) return;

  const guardado = await db
    .from("whatsapp_conversaciones")
    .select("paso, datos, actualizado_en")
    .eq("tenant_id", tenant)
    .eq("telefono", telefono)
    .maybeSingle();
  const vigente = guardado.data && Date.now() - Date.parse(guardado.data.actualizado_en) < VIGENCIA_ESTADO_MS;
  const estado: Estado | null = vigente ? leerEstado(guardado.data!.paso, guardado.data!.datos) : null;

  const fuente: Fuente = {
    optica,
    operativos: async () => {
      const r = await db.rpc("operativos_whatsapp", { p_tenant: tenant });
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
    horas: async (op) => {
      const r = await db.rpc("horas_whatsapp", { p_tenant: tenant, p_operativo: op });
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
    agendar: async (op, fecha, hora, nombre) => {
      const r = await db.rpc("agendar_cita_whatsapp", { p_tenant: tenant, p_operativo: op, p_fecha: fecha, p_hora: hora, p_nombre: nombre, p_telefono: telefono });
      if (r.error) throw new Error(r.error.message);
      return r.data;
    },
    citas: async () => {
      const r = await db.rpc("citas_whatsapp_de", { p_tenant: tenant, p_telefono: telefono });
      if (r.error) throw new Error(r.error.message);
      return r.data ?? [];
    },
    cancelar: async (cita) => {
      const r = await db.rpc("cancelar_cita_whatsapp", { p_tenant: tenant, p_cita: cita, p_telefono: telefono });
      if (r.error) throw new Error(r.error.message);
      return r.data === true;
    },
  };

  const { respuesta, estado: siguiente } = await responder(estado, m.texto, fuente);
  if (siguiente) {
    const { paso, ...datos } = siguiente;
    await db.from("whatsapp_conversaciones").upsert({ tenant_id: tenant, telefono, paso, datos, actualizado_en: new Date().toISOString() });
  } else {
    await db.from("whatsapp_conversaciones").delete().eq("tenant_id", tenant).eq("telefono", telefono);
  }
  await enviarTexto(m.phoneNumberId, telefono, respuesta);
}
