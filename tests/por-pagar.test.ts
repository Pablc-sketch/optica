import { describe, expect, it } from "vitest";
import { pendienteDeOperativo, resumirPorPagar, type OperativoPorPagar } from "../src/lib/por-pagar";

const base: OperativoPorPagar = {
  operativoId: "a",
  nombre: "Piedra Roja",
  fecha: "2026-10-20",
  sueldos: { isadora: 90000, madre: 100000, pablo: 100000 },
  fides: 200000,
  gastos: 104000,
  ahorro: 60000,
  pagado: { isadora: 0, madre: 0, pablo: 0, fides: 0, gastos: 0, ahorro: 0 },
};

describe("por pagar", () => {
  it("todo pendiente: suma sueldos, costos y muestra el ahorro", () => {
    const p = pendienteDeOperativo(base);
    expect(p.sueldos).toBe(290000);
    expect(p.costos).toBe(304000);
    expect(p.ahorro).toBe(60000);
    expect(p.total).toBe(594000);
  });
  it("lo ya pagado no aparece", () => {
    const p = pendienteDeOperativo({
      ...base,
      pagado: { ...base.pagado, isadora: 90000, madre: 40000, pablo: 0, fides: 200000 },
    });
    expect(p.sueldos).toBe(60000 + 100000);
    expect(p.costos).toBe(104000);
  });
  it("un pago de más no da negativo", () => {
    const p = pendienteDeOperativo({ ...base, pagado: { ...base.pagado, isadora: 999999 } });
    expect(p.sueldos).toBe(200000);
  });
  it("operativo todo pagado: sin pendiente ni ahorro, y no sale en la lista", () => {
    const pagado = { isadora: 90000, madre: 100000, pablo: 100000, fides: 200000, gastos: 104000, ahorro: 60000 };
    expect(pendienteDeOperativo({ ...base, pagado })).toMatchObject({ total: 0, ahorro: 0 });
    expect(resumirPorPagar([{ ...base, pagado }]).operativos).toEqual([]);
  });
  it("suma varios operativos y los ordena por fecha", () => {
    const r = resumirPorPagar([
      { ...base, operativoId: "b", fecha: "2026-10-25" },
      { ...base, operativoId: "a", fecha: "2026-10-10", pagado: { ...base.pagado, fides: 200000 } },
    ]);
    expect(r.operativos.map((o) => o.operativoId)).toEqual(["a", "b"]);
    expect(r.total).toBe(594000 + 394000);
    expect(r.ahorro).toBe(120000);
  });
  it("sin cristales (consulta sola) no inventa costos", () => {
    const p = pendienteDeOperativo({ ...base, fides: 0 });
    expect(p.costos).toBe(104000);
  });
});

 it("el ahorro sigue pendiente al pagar todas las cuentas", () => {
   const p = pendienteDeOperativo({ ...base, pagado: { isadora: 90000, madre: 100000, pablo: 100000, fides: 200000, gastos: 104000, ahorro: 10000 } });
   expect(p).toMatchObject({ total: 0, ahorro: 50000 });
   expect(resumirPorPagar([{ ...base, pagado: { ...base.pagado, fides: 50000 } }]).costos).toBe(254000);
 });
 it("no descarta el operativo 13 ni un operativo con solo gastos", () => {
   const lista = Array.from({ length: 15 }, (_, i) => ({ ...base, operativoId: String(i) }));
   expect(resumirPorPagar(lista).operativos).toHaveLength(15);
   const p = pendienteDeOperativo({ ...base, sueldos: { isadora: 0, madre: 0, pablo: 0 }, ahorro: 0, fides: 0 });
   expect(p.costos).toBe(104000);
 });
