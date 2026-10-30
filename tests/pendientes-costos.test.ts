import { describe, expect, it } from "vitest";
import { pendientesCostos, prefijoCosto } from "../src/lib/pagos-operativo";
import { leerTodas } from "../src/lib/leer-todas";
import { idPagoCosto } from "../src/lib/id-pago";
import { resumirCaja } from "../src/lib/caja";
import { pendienteDeOperativo, type OperativoPorPagar } from "../src/lib/por-pagar";

describe("pagos de costos", () => {
  it("dos días de equipos, abono y sobrepago por categoría", () => {
    const filas = pendientesCostos({ costo_equipos: 104000, costo_arriendo: 50000, costo_transporte: 0, costo_viaticos: 0, costo_otros: 0 }, [
      { descripcion: prefijoCosto("costo_equipos") + "Colegio", monto: 40000 },
      { descripcion: prefijoCosto("costo_arriendo") + "Colegio", monto: 60000 },
    ]);
    expect(filas.reduce((s, c) => s + Math.max(0, c.total - c.pagado), 0)).toBe(64000);
  });
  it("pagar reduce caja y deuda una sola vez; el disponible no cambia", () => {
    const op: OperativoPorPagar = { operativoId: "1", nombre: "Colegio", fecha: "2026-10-01", sueldos: { isadora: 0, madre: 0, pablo: 0 },
      fides: 0, gastos: 104000, ahorro: 10000, pagado: { isadora: 0, madre: 0, pablo: 0, fides: 0, gastos: 0, ahorro: 0 } };
    const disponible = (salida: number, pagado: number, ahorro: number) => {
      const caja = resumirCaja({ entroDigital: 200000, entroEfectivo: 0, entroDebito: 0, entroCredito: 0, salioDigital: salida, salioEfectivo: 0 });
      const pendientes = pendienteDeOperativo({ ...op, pagado: { ...op.pagado, gastos: pagado, ahorro } });
      return caja.total - pendientes.total - pendientes.ahorro;
    };
    expect(disponible(0, 0, 0)).toBe(86000);
    expect(disponible(40000, 40000, 0)).toBe(86000);
    expect(disponible(114000, 104000, 10000)).toBe(86000);
  });
  it("dos pestañas con el mismo saldo compiten por la misma clave", () => {
    expect(idPagoCosto("op", "costo_equipos", 0)).toBe(idPagoCosto("op", "costo_equipos", 0));
    expect(idPagoCosto("op", "costo_equipos", 40000)).not.toBe(idPagoCosto("op", "costo_equipos", 0));
    expect(idPagoCosto("op", "costo_arriendo", 0)).not.toBe(idPagoCosto("op", "costo_equipos", 0));
    expect(idPagoCosto("op", "costo_equipos", 0)).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  });
});
describe("lectura completa", () => {
  it("lee más de mil registros sin truncar deudas antiguas", async () => {
    const registros = Array.from({ length: 1205 }, (_, id) => ({ id }));
    const r = await leerTodas(async (a, b) => ({ data: registros.slice(a, b + 1), error: null }));
    expect(r.data).toEqual(registros);
  });
  it("un error en una página no devuelve un saldo parcial", async () => {
    const r = await leerTodas(async (a) => a === 0 ? { data: Array(500).fill(1), error: null }
      : { data: null, error: { message: "No disponible" } });
    expect(r.data).toBeNull();
    expect(r.error?.message).toBe("No disponible");
  });
});
