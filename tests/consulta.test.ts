import { describe, expect, it } from "vitest";
import { DESCRIPCION_CONSULTA, totalConsultas } from "../src/lib/consulta";

describe("totalConsultas", () => {
  it("suma solo los ítems de consulta", () => {
    expect(
      totalConsultas([
        { descripcion: DESCRIPCION_CONSULTA, cantidad: 1, precio_unitario: 5000 },
        { descripcion: "Cristales Monofocal", cantidad: 1, precio_unitario: 48000 },
        { descripcion: DESCRIPCION_CONSULTA, cantidad: 2, precio_unitario: 5000, descuento: 0 },
      ])
    ).toBe(15000);
  });
});
