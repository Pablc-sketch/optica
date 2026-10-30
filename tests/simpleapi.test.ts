import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { consultarSimpleApi, simpleApiConfigurada } from "../src/lib/simpleapi";

const config = { apiKey: "test-placeholder", tenantId: "optica-a" };
const respuesta = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

describe("conexión de SimpleAPI", () => {
  it("no permite usar la cuenta de otra óptica ni consulta sin configuración", async () => {
    const solicitar = vi.fn();
    expect(simpleApiConfigurada("optica-b", config)).toBe(false);
    expect(await consultarSimpleApi("optica-b", config, solicitar)).toEqual({ estado: "pendiente" });
    expect(await consultarSimpleApi("optica-a", {}, solicitar)).toEqual({ estado: "pendiente" });
    expect(await consultarSimpleApi("optica-a", { ...config, apiKey: "  " }, solicitar)).toEqual({ estado: "pendiente" });
    expect(solicitar).not.toHaveBeenCalled();
  });

  it("solo consulta el plan DTE y no devuelve claves ni información de otros productos", async () => {
    const solicitar = vi.fn().mockResolvedValue(respuesta([
      { servicio: "Folios", uso: 9, maximo: 20 },
      { servicio: "SimpleAPI", uso: 8, maximo: 500, respaldos: ["privado"], apiKey: config.apiKey },
    ]));
    const r = await consultarSimpleApi("optica-a", config, solicitar);
    expect(r).toEqual({ estado: "conectado", uso: 8, maximo: 500 });
    expect(solicitar).toHaveBeenCalledOnce();
    const [url, opciones] = solicitar.mock.calls[0];
    expect(url).toBe("https://api.simpleapi.cl/api/v1/Suscripcion/status");
    expect(opciones).toMatchObject({ method: "GET", cache: "no-store", redirect: "error", headers: { Authorization: config.apiKey } });
    expect(opciones.body).toBeUndefined();
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(r)).not.toContain(config.apiKey);
  });

  it.each([[401, "sin_acceso"], [403, "sin_acceso"], [429, "limite"], [500, "error"]])(
    "distingue el error HTTP %s y no expone el cuerpo",
    async (status, estado) => {
      const json = vi.fn();
      const solicitar = vi.fn().mockResolvedValue({ ok: false, status, json });
      expect(await consultarSimpleApi("optica-a", config, solicitar)).toEqual({ estado });
      expect(json).not.toHaveBeenCalled();
    },
  );

  it.each([null, {}, [], [{ servicio: "Folios", uso: 1, maximo: 20 }],
    [{ servicio: "SimpleAPI", uso: -1, maximo: 500 }],
    [{ servicio: "SimpleAPI", uso: "1", maximo: 500 }],
    [{ servicio: "SimpleAPI", uso: 0, maximo: 0 }],
  ])("rechaza respuestas incompletas o inválidas: %j", async (data) => {
    expect(await consultarSimpleApi("optica-a", config, vi.fn().mockResolvedValue(respuesta(data)))).toEqual({ estado: "error" });
  });

  it("conserva el uso agotado y maneja fallos de red sin revelar detalles", async () => {
    expect(await consultarSimpleApi("optica-a", config, vi.fn().mockResolvedValue(respuesta([
      { servicio: "SimpleAPI", uso: 500, maximo: 500 },
    ])))).toEqual({ estado: "conectado", uso: 500, maximo: 500 });
    expect(await consultarSimpleApi("optica-a", config, vi.fn().mockRejectedValue(new Error(config.apiKey)))).toEqual({ estado: "error" });
  });
});
