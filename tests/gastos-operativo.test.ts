import { describe, expect, it } from "vitest";
import { gastosDeOperativo } from "../src/lib/gastos-operativo";

const base = { costo_transporte: 10000, costo_arriendo: 50000, costo_viaticos: 5000, costo_otros: 0 };

describe("gastosDeOperativo", () => {
  it("suma todo, incluido equipos y ayudante", () => {
    expect(gastosDeOperativo({ ...base, costo_ayudante: 40000, costo_equipos: 52000 })).toBe(157000);
  });
  it("sin equipos ni ayudante (operativos antiguos) sigue igual", () => {
    expect(gastosDeOperativo(base)).toBe(65000);
    expect(gastosDeOperativo({ ...base, costo_ayudante: null, costo_equipos: null })).toBe(65000);
  });
});
