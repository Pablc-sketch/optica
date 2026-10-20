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

describe("esVentaDeConsulta", () => {
  it("solo consulta: sí; con lentes: no", async () => {
    const { esVentaDeConsulta, DESCRIPCION_CONSULTA } = await import("../src/lib/consulta");
    expect(esVentaDeConsulta([{ descripcion: DESCRIPCION_CONSULTA }])).toBe(true);
    expect(esVentaDeConsulta([{ descripcion: DESCRIPCION_CONSULTA }, { descripcion: "Cristales Monofocal" }])).toBe(false);
    expect(esVentaDeConsulta([])).toBe(false);
  });
});
