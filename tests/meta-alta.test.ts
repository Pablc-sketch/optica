import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ctx = vi.hoisted(() => ({ perfil: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil: ctx.perfil, SinPermiso: class SinPermiso extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => ({ upsert: ctx.upsert }) }) }));

import { leerAvisoMeta, origenDeMeta } from "@/lib/meta-alta";
import { completarAltaMeta } from "@/lib/actions/whatsapp";

// Identificadores ficticios.
const TENANT = "11111111-1111-4111-8111-111111111111";
const ENTRADA = { code: "codigo-ficticio", phoneNumberId: "1000000001", wabaId: "2000000002", businessId: "3000000003", enApp: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_META_APP_ID", "999000111");
  vi.stubEnv("NEXT_PUBLIC_META_CONFIG_ID", "888000222");
  vi.stubEnv("WHATSAPP_APP_SECRET", "secreto-ficticio");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verificar-ficticio");
  ctx.perfil.mockResolvedValue({ supabase: {}, tenantId: TENANT, user: { id: "u1" }, rol: "admin" });
  ctx.upsert.mockResolvedValue({ error: null });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

// Meta falso: responde según la URL y anota cada llamada.
function metaFalso() {
  const llamadas: { metodo: string; url: string; auth: string | null }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada, init) => {
    const url = String(entrada);
    llamadas.push({ metodo: init?.method ?? "GET", url, auth: new Headers(init?.headers).get("authorization") });
    if (url.includes("/oauth/access_token")) return Response.json({ access_token: "token-ficticio", token_type: "bearer" });
    if (url.includes("/subscribed_apps")) return Response.json({ success: true });
    if (url.includes("/1000000001?fields=")) return Response.json({ display_phone_number: "+56 9 1111 2222", verified_name: "Óptica Ficticia" });
    return new Response("no", { status: 404 });
  });
  return llamadas;
}

describe("alta oficial de Meta (coexistencia)", () => {
  it("acepta solo avisos de facebook.com y lee el formato v5 y el anterior", () => {
    expect(origenDeMeta("https://www.facebook.com")).toBe(true);
    expect(origenDeMeta("https://evilfacebook.com")).toBe(false);
    expect(origenDeMeta("nada")).toBe(false);
    const v5 = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", data: { phone_number_id: "1000000001", messaging_account_ids: ["2000000002"], business_id: "3000000003", is_on_biz_app: true } };
    expect(leerAvisoMeta(JSON.stringify(v5))).toEqual({ tipo: "fin", sesion: { phoneNumberId: "1000000001", wabaId: "2000000002", businessId: "3000000003", enApp: true } });
    expect(leerAvisoMeta(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { phone_number_id: "1", waba_id: "2", is_on_biz_app: false } }))).toMatchObject({ sesion: { enApp: false, wabaId: "2" } });
    expect(leerAvisoMeta(JSON.stringify({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE" } }))).toEqual({ tipo: "cancelado", detalle: "PHONE" });
    expect(leerAvisoMeta("{rotos")).toBeNull();
    expect(leerAvisoMeta(JSON.stringify({ type: "OTRO" }))).toBeNull();
  });

  it("canjea el código, verifica el número y suscribe los avisos; no registra, no sincroniza, no envía", async () => {
    const llamadas = metaFalso();
    const r = await completarAltaMeta(ENTRADA);
    expect(r.mensaje).toContain("+56 9 1111 2222");
    expect(llamadas.map((l) => `${l.metodo} ${new URL(l.url).pathname}`)).toEqual([
      "GET /v27.0/oauth/access_token",
      "GET /v27.0/1000000001",
      "POST /v27.0/2000000002/subscribed_apps",
    ]);
    expect(llamadas.some((l) => /register|smb_app_data|\/messages/.test(l.url))).toBe(false);
    // Se guardan solo identificadores, nunca el token.
    const guardado = ctx.upsert.mock.calls[0][0];
    expect(guardado).toMatchObject({ tenant_id: TENANT, phone_number_id: "1000000001", waba_id: "2000000002", coexistencia: true });
    expect(JSON.stringify(guardado)).not.toContain("token-ficticio");
  });

  it("rechaza un número que no viene de la app WhatsApp Business (no migra números)", async () => {
    const llamadas = metaFalso();
    const r = await completarAltaMeta({ ...ENTRADA, enApp: false });
    expect(r.error).toContain("coexistencia");
    expect(llamadas).toEqual([]);
    expect(ctx.upsert).not.toHaveBeenCalled();
  });

  it("si Meta no acepta el código, no guarda nada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 400 }));
    const r = await completarAltaMeta(ENTRADA);
    expect(r.error).toContain("código");
    expect(ctx.upsert).not.toHaveBeenCalled();
  });

  it("solo el administrador y con datos válidos", async () => {
    expect((await completarAltaMeta({ ...ENTRADA, phoneNumberId: "abc" })).error).toBeTruthy();
    expect(ctx.perfil).toHaveBeenCalledWith({ roles: ["admin"], suscripcion: true });
  });
});
