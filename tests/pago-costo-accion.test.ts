import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn(), perfil: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil: mock.perfil, SinPermiso: class SinPermiso extends Error {} }));
import { registrarPagoCosto } from "../src/lib/actions/cierre";
import { idPagoCosto } from "../src/lib/id-pago";

const operativoId = "11111111-1111-4111-a111-111111111111";
const input = { operativoId, clave: "costo_equipos" as const, monto: 40000, caja: "digital" as const, pagadoEsperado: 0 };
function respuesta(data: unknown, error: unknown = null) {
  const insertar = vi.fn();
  const r = { data, error };
  const builder = {
    select: () => builder, eq: () => builder, like: () => builder, order: () => builder, range: () => builder,
    maybeSingle: () => Promise.resolve(r),
    insert: insertar.mockResolvedValue(r),
    then: (resolve: (value: typeof r) => unknown) => Promise.resolve(r).then(resolve),
  };
  return { builder, insertar };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.perfil.mockResolvedValue({ tenantId: "tenant", supabase: { from: mock.from } });
});
describe("registro de un pago", () => {
  it("registra un abono sin modificar el costo previsto", async () => {
    const escritura = respuesta(null);
    mock.from.mockReturnValueOnce(respuesta(null).builder)
      .mockReturnValueOnce(respuesta({ id: operativoId, nombre: "Colegio", costo_equipos: 104000 }).builder)
      .mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(escritura.builder);
    expect(await registrarPagoCosto(input)).toEqual({ ok: true });
    expect(escritura.insertar).toHaveBeenCalledWith(expect.objectContaining({ monto: 40000, operativo_id: operativoId, tenant_id: "tenant", caja: "digital" }));
    expect(escritura.insertar.mock.calls[0][0].id).toBe(idPagoCosto(operativoId, "costo_equipos", 0));
  });
  it("un reintento del mismo pago no inserta otra salida", async () => {
    mock.from.mockReturnValueOnce(respuesta({ id: "previo", operativo_id: operativoId, monto: 40000, caja: "digital", descripcion: "Costo operativo · costo_equipos · Colegio" }).builder);
    expect(await registrarPagoCosto(input)).toEqual({ ok: true });
    expect(mock.from).toHaveBeenCalledTimes(1);
  });
  it("rechaza un formulario desactualizado cuando aparecen otros abonos", async () => {
    mock.from.mockReturnValueOnce(respuesta(null).builder)
      .mockReturnValueOnce(respuesta({ id: operativoId, nombre: "Colegio", costo_equipos: 104000 }).builder)
      .mockReturnValueOnce(respuesta([{ id: "manual", monto: 20000, descripcion: "Costo operativo · costo_equipos · Colegio" }]).builder);
    expect((await registrarPagoCosto(input)).ok).toBe(false);
    expect(mock.from).toHaveBeenCalledTimes(3);
  });
  it("no escribe si el operativo no es accesible", async () => {
    mock.from.mockReturnValueOnce(respuesta(null).builder).mockReturnValueOnce(respuesta(null).builder);
    expect((await registrarPagoCosto(input)).ok).toBe(false);
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
  it("rechaza montos negativos y categorías inventadas antes de consultar", async () => {
    expect((await registrarPagoCosto({ ...input, monto: -1 })).ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});
