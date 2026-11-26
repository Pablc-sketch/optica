import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ from: vi.fn(), perfil: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil: mock.perfil, SinPermiso: class SinPermiso extends Error {} }));
import { registrarPagoCosto, registrarPagosChequeo } from "../src/lib/actions/cierre";
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
      .mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(escritura.builder);
    expect(await registrarPagoCosto(input)).toEqual({ ok: true });
    expect(escritura.insertar).toHaveBeenCalledWith(expect.objectContaining({ monto: 40000, operativo_id: operativoId, tenant_id: "tenant", caja: "digital" }));
    expect(escritura.insertar.mock.calls[0][0].id).toBe(idPagoCosto(operativoId, "costo_equipos", 0));
  });
  it("permite pagar de nuevo después de corregir a cero sin perder el registro anterior", async () => {
    const escritura = respuesta(null);
    mock.from.mockReturnValueOnce(respuesta({ id:"corregido",operativo_id:operativoId,monto:0,caja:"digital",descripcion:"Costo operativo · costo_equipos · Colegio",revision_version:2 }).builder)
      .mockReturnValueOnce(respuesta(null).builder)
      .mockReturnValueOnce(respuesta({id:operativoId,nombre:"Colegio",costo_equipos:104000}).builder)
      .mockReturnValueOnce(respuesta([{id:"corregido",monto:0,descripcion:"Costo operativo · costo_equipos · Colegio"}]).builder)
      .mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(escritura.builder);
    expect(await registrarPagoCosto(input)).toEqual({ok:true});
    expect(escritura.insertar.mock.calls[0][0].id).not.toBe(idPagoCosto(operativoId,"costo_equipos",0));
  });
  it("un reintento del mismo pago no inserta otra salida", async () => {
    mock.from.mockReturnValueOnce(respuesta({ id: "previo", operativo_id: operativoId, monto: 40000, caja: "digital", descripcion: "Costo operativo · costo_equipos · Colegio" }).builder);
    expect(await registrarPagoCosto(input)).toEqual({ ok: true });
    expect(mock.from).toHaveBeenCalledTimes(1);
  });
  it("rechaza un formulario desactualizado cuando aparecen otros abonos", async () => {
    mock.from.mockReturnValueOnce(respuesta(null).builder)
      .mockReturnValueOnce(respuesta({ id: operativoId, nombre: "Colegio", costo_equipos: 104000 }).builder)
      .mockReturnValueOnce(respuesta([{ id: "manual", monto: 20000, descripcion: "Costo operativo · costo_equipos · Colegio" }]).builder).mockReturnValueOnce(respuesta([]).builder);
    expect((await registrarPagoCosto(input)).ok).toBe(false);
    expect(mock.from).toHaveBeenCalledTimes(4);
  });
  it("no escribe si el operativo no es accesible", async () => {
    mock.from.mockReturnValueOnce(respuesta(null).builder).mockReturnValueOnce(respuesta(null).builder);
    expect((await registrarPagoCosto(input)).ok).toBe(false);
    expect(mock.from).toHaveBeenCalledTimes(2);
  });
  it("registra la fecha histórica real del pago omitido", async () => {
    const escritura=respuesta(null);
    mock.from.mockReturnValueOnce(respuesta(null).builder).mockReturnValueOnce(respuesta({id:operativoId,nombre:"Colegio",costo_equipos:104000}).builder)
      .mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(escritura.builder);
    expect(await registrarPagoCosto({...input,fecha:"2026-10-20"})).toEqual({ok:true});
    expect(escritura.insertar).toHaveBeenCalledWith(expect.objectContaining({fecha:"2026-10-20"}));
  });
  it("no paga nuevamente si un gasto global ya cubre el costo", async () => {
    mock.from.mockReturnValueOnce(respuesta(null).builder).mockReturnValueOnce(respuesta({id:operativoId,nombre:"Colegio",costo_equipos:104000}).builder)
      .mockReturnValueOnce(respuesta([]).builder).mockReturnValueOnce(respuesta([{id:"a",gasto_id:"g",operativo_id:operativoId,clave:"costo_equipos",monto:104000,anulado_en:null}]).builder);
    expect((await registrarPagoCosto(input)).ok).toBe(false);
  });
  it("rechaza montos negativos y categorías inventadas antes de consultar", async () => {
    expect((await registrarPagoCosto({ ...input, monto: -1 })).ok).toBe(false);
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe("pago global de costos del chequeo", () => {
  const chequeo = "22222222-2222-4222-a222-222222222222";
  const otraSede = "33333333-3333-4333-a333-333333333333";
  const inputs = [operativoId, otraSede].map(id => ({
    ...input, operativoId: id, clave: "fides" as const, monto: 15_000,
  }));

  function prepararGrupo(segundoChequeo = chequeo) {
    const escritura = respuesta(null);
    let gastosConsultados = 0;
    let operativosConsultados = 0;
    mock.from.mockImplementation((tabla: string) => {
      if (tabla === "operativos") {
        const primero = operativosConsultados++ === 0;
        return respuesta({ id: primero ? operativoId : otraSede, nombre: "Sede", chequeo_id: primero ? chequeo : segundoChequeo,
          estado: "completado", costo_fides_real: 15_000 }).builder;
      }
      if (tabla === "gastos_globales") {
        const numero = gastosConsultados++;
        if (numero < 2) return respuesta(null).builder;
        if (numero < 4) return respuesta([]).builder;
        return escritura.builder;
      }
      if (tabla === "tenants") return { select: () => ({ single: () => Promise.resolve({ data: {}, error: null }) }) };
      return respuesta([]).builder;
    });
    return escritura;
  }

  it("inserta todas las sedes en una sola operación", async () => {
    const escritura = prepararGrupo();
    expect(await registrarPagosChequeo(chequeo, inputs)).toEqual({ ok: true });
    expect(escritura.insertar).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ operativo_id: operativoId, monto: 15_000 }),
      expect.objectContaining({ operativo_id: otraSede, monto: 15_000 }),
    ]);
  });

  it("no escribe si una sede ya no pertenece al chequeo", async () => {
    const escritura = prepararGrupo("otro");
    expect(await registrarPagosChequeo(chequeo, inputs)).toMatchObject({ ok: false });
    expect(escritura.insertar).not.toHaveBeenCalled();
  });
});
