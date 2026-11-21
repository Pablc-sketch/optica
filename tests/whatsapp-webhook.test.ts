import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ctx = vi.hoisted(() => ({ after: vi.fn(), admin: vi.fn() }));
vi.mock("next/server", () => ({ after: ctx.after }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: ctx.admin }));

import { GET, POST } from "../src/app/api/whatsapp/webhook/route";
import { firmaValida, mensajesDelAviso } from "@/lib/whatsapp-cloud";

const SECRETO = "secreto-ficticio";
const firmar = (cuerpo: string) => "sha256=" + createHmac("sha256", SECRETO).update(cuerpo).digest("hex");
// Avisos ficticios con la forma de Meta.
const entrante = {
  entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "1234567890", display_phone_number: "56222222222" },
    contacts: [{ wa_id: "56911112222", profile: { name: "Rosa" } }],
    messages: [{ from: "56911112222", id: "wamid.A", timestamp: "1900000000", type: "text", text: { body: "Hola, soy de Labrador, ¿cuándo van?" } }],
  } }] }],
};
const eco = {
  entry: [{ changes: [{ field: "smb_message_echoes", value: {
    metadata: { phone_number_id: "1234567890" },
    message_echoes: [{ from: "56222222222", to: "56911112222", id: "wamid.B", timestamp: "1900000100", type: "text", text: { body: "El sábado en la sede" } }],
  } }] }],
};
const historial = {
  entry: [{ changes: [{ field: "history", value: {
    metadata: { phone_number_id: "1234567890", display_phone_number: "56222222222" },
    history: [{ threads: [{ id: "56933334444", messages: [
      { from: "56933334444", id: "wamid.C", timestamp: "1890000000", type: "text", text: { body: "Quiero hora para mi mamá" } },
      { from: "56222222222", id: "wamid.D", timestamp: "1890000100", type: "image", image: { caption: "afiche" } },
    ] }] }],
  } }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRETO);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verificar-ficticio");
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook de WhatsApp (solo lectura)", () => {
  it("responde el desafío de Meta solo con el token correcto", async () => {
    const ok = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificar-ficticio&hub.challenge=777"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("777");
    const malo = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=777"));
    expect(malo.status).toBe(403);
  });

  it("rechaza avisos sin la firma de Meta y no toca la base", async () => {
    const cuerpo = JSON.stringify(entrante);
    const r = await POST(new Request("https://x.test", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(r.status).toBe(401);
    expect(ctx.after).not.toHaveBeenCalled();
    expect(ctx.admin).not.toHaveBeenCalled();
  });

  it("acepta avisos firmados y guarda después de responder, sin enviar nada", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    const cuerpo = JSON.stringify(entrante);
    const r = await POST(new Request("https://x.test", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo) } }));
    expect(r.status).toBe(200);
    expect(ctx.after).toHaveBeenCalledTimes(1);
    expect(fetchEspia).not.toHaveBeenCalled();
    fetchEspia.mockRestore();
  });

  it("firma: cualquier cambio en el cuerpo la invalida", () => {
    const cuerpo = JSON.stringify(entrante);
    expect(firmaValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
    expect(firmaValida(cuerpo + " ", firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, null, SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, firmar(cuerpo), "")).toBe(false);
  });

  it("lee mensajes nuevos y respuestas de la óptica (eco); ignora historial y agenda", () => {
    expect(mensajesDelAviso(entrante)).toEqual([{
      phoneNumberId: "1234567890", telefono: "56911112222", nombrePerfil: "Rosa", wamid: "wamid.A",
      direccion: "entrante", texto: "Hola, soy de Labrador, ¿cuándo van?", enviadoEn: new Date(1900000000 * 1000).toISOString(),
    }]);
    expect(mensajesDelAviso(eco)).toMatchObject([{ telefono: "56911112222", direccion: "saliente", texto: "El sábado en la sede" }]);
    // El historial y la agenda NO se importan.
    expect(mensajesDelAviso(historial)).toEqual([]);
    expect(mensajesDelAviso({ entry: [{ changes: [{ field: "smb_app_state_sync", value: { metadata: { phone_number_id: "1234567890" }, state_sync: [{ contact: { phone_number: "56900000000" } }] } }] }] })).toEqual([]);
    // Sin teléfono (solo identificador de usuario de Meta) no hay a quién llamar: se salta.
    expect(mensajesDelAviso({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1234567890" }, messages: [{ user_id: "CL.123", id: "wamid.Z", type: "text", text: { body: "hola" } }] } }] }] })).toEqual([]);
    // Avisos de estado (entregado/leído) no son mensajes.
    expect(mensajesDelAviso({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, statuses: [{}] } }] }] })).toEqual([]);
    expect(mensajesDelAviso(null)).toEqual([]);
  });
});
