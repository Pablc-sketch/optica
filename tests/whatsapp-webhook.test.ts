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
const aviso = {
  entry: [{ changes: [{ field: "messages", value: {
    metadata: { phone_number_id: "1234567890" },
    messages: [{ from: "56911112222", id: "wamid.A", type: "text", text: { body: "Hola" } }],
  } }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WHATSAPP_APP_SECRET", SECRETO);
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verificar-ficticio");
});
afterEach(() => vi.unstubAllEnvs());

describe("webhook de WhatsApp", () => {
  it("responde el desafío de Meta solo con el token correcto", async () => {
    const ok = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificar-ficticio&hub.challenge=777"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("777");
    const malo = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=777"));
    expect(malo.status).toBe(403);
  });

  it("rechaza avisos sin la firma de Meta y no toca la base", async () => {
    const cuerpo = JSON.stringify(aviso);
    const r = await POST(new Request("https://x.test", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": "sha256=00" } }));
    expect(r.status).toBe(401);
    expect(ctx.after).not.toHaveBeenCalled();
    expect(ctx.admin).not.toHaveBeenCalled();
  });

  it("acepta avisos firmados y procesa después de responder", async () => {
    const cuerpo = JSON.stringify(aviso);
    const r = await POST(new Request("https://x.test", { method: "POST", body: cuerpo, headers: { "x-hub-signature-256": firmar(cuerpo) } }));
    expect(r.status).toBe(200);
    expect(ctx.after).toHaveBeenCalledTimes(1);
  });

  it("firma: cualquier cambio en el cuerpo la invalida", () => {
    const cuerpo = JSON.stringify(aviso);
    expect(firmaValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
    expect(firmaValida(cuerpo + " ", firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, null, SECRETO)).toBe(false);
    expect(firmaValida(cuerpo, firmar(cuerpo), "")).toBe(false);
  });

  it("extrae solo mensajes entrantes con número de la óptica", () => {
    expect(mensajesDelAviso(aviso)).toEqual([{ phoneNumberId: "1234567890", de: "56911112222", wamid: "wamid.A", texto: "Hola" }]);
    // Avisos de estado (entregado/leído) no son mensajes.
    expect(mensajesDelAviso({ entry: [{ changes: [{ field: "messages", value: { metadata: { phone_number_id: "1" }, statuses: [{}] } }] }] })).toEqual([]);
    expect(mensajesDelAviso(null)).toEqual([]);
  });
});
