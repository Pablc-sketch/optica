import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { leerMercadoPago } from "../src/lib/mercadopago-lectura";

describe("consulta de Mercado Pago", () => {
  it("no consulta sin configuración ni para otra óptica", async () => {
    const consultar = vi.fn();
    expect((await leerMercadoPago("a", {}, consultar)).estado).toBe("pendiente");
    expect((await leerMercadoPago("b", { token: "test-placeholder", tenantId: "a" }, consultar)).estado).toBe("pendiente");
    expect(consultar).not.toHaveBeenCalled();
  });
  it("solo hace GET y limita los datos mostrados; no mezcla otras monedas", async () => {
    const consultar = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [
      { id: 123, transaction_amount: 30000, currency_id: "CLP", date_created: "2026-10-30T10:00:00Z", status: "approved", payer: { email: "private@example.test" } },
      { id: 456, transaction_amount: 30, currency_id: "USD", date_created: "2026-10-30", status: "approved" },
    ] }) });
    const r = await leerMercadoPago("a", { token: "test-placeholder", tenantId: "a" }, consultar);
    expect(r).toEqual({ estado: "conectado", pagos: [{ id: "123", fecha: "2026-10-30T10:00:00Z", monto: 30000, estado: "approved" }] });
    expect(consultar.mock.calls[0][1].cache).toBe("no-store");
    expect(consultar.mock.calls[0][1].method).toBeUndefined();
  });
  it("un fallo de autorización no se presenta como cero pagos", async () => {
    const consultar = vi.fn().mockResolvedValue({ ok: false });
    expect((await leerMercadoPago("a", { token: "test-placeholder", tenantId: "a" }, consultar)).estado).toBe("error");
  });
  it("controla fallos de red y respuestas inválidas", async () => {
    const config = { token: "test-placeholder", tenantId: "a" };
    expect((await leerMercadoPago("a", config, vi.fn().mockRejectedValue(new Error("network")))).estado).toBe("error");
    expect((await leerMercadoPago("a", config, vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))).estado).toBe("error");
  });
});
