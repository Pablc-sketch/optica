import { after } from "next/server";
import { firmaValida, mensajesDelAviso, tokenVerificacionValido } from "@/lib/whatsapp-cloud";
import { guardarMensajes } from "@/lib/whatsapp-guardar";

// Webhook de WhatsApp Cloud API. Meta avisa acá cada mensaje que entra al
// WhatsApp Business de una óptica conectada y cada respuesta que la óptica
// envía desde su app. Lentia solo GUARDA una copia para la bandeja: no
// responde nada.
//  - GET: Meta comprueba el webhook al registrarlo (hub.verify_token).
//  - POST: solo con la firma de Meta. La óptica sale del número que recibió
//    el mensaje (whatsapp_numeros), nunca del contenido.

export const runtime = "nodejs";
export const maxDuration = 60;

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
  // Meta espera respuesta rápida; se guarda después de contestar.
  if (mensajes.length > 0) after(() => guardarMensajes(mensajes));
  return new Response("ok", { status: 200 });
}
