import { beforeEach, describe, expect, it, vi } from "vitest";
const { perfil, consultar } = vi.hoisted(() => ({ perfil: vi.fn(), consultar: vi.fn() }));
vi.mock("../src/lib/autorizacion", () => ({ requerirPerfil: perfil }));
vi.mock("../src/lib/simpleapi", () => ({ consultarSimpleApi: consultar }));
import { comprobarConexionSimpleApi } from "../src/lib/actions/simpleapi";

beforeEach(() => vi.resetAllMocks());
describe("autorización de la consulta SimpleAPI", () => {
  it("obtiene la óptica de la sesión y exige administrador con suscripción", async () => {
    perfil.mockResolvedValue({ tenantId: "optica-sesion" });
    consultar.mockResolvedValue({ estado: "conectado", uso: 0, maximo: 500 });
    await comprobarConexionSimpleApi();
    expect(perfil).toHaveBeenCalledWith({ roles: ["admin"], suscripcion: true });
    expect(consultar).toHaveBeenCalledWith("optica-sesion");
  });
  it("no llama al proveedor si la sesión o el rol no autorizan", async () => {
    perfil.mockRejectedValue(new Error("Sin permiso"));
    await expect(comprobarConexionSimpleApi()).rejects.toThrow("Sin permiso");
    expect(consultar).not.toHaveBeenCalled();
  });
});
