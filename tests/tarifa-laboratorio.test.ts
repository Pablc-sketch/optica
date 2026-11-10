import { describe, expect, it } from "vitest";
import { costoParDeTarifa, elegirTarifa, type TarifaLaboratorio } from "../src/lib/tarifa-laboratorio";

const base: TarifaLaboratorio = {
  proveedor_id: "lab-1", tipo_lente: "Monofocal", tratamiento: "Antirreflejo", rango_receta: null,
  costo: 3000, unidad: "unidad", montaje: "incluido", montaje_costo: 0, iva: "incluido",
};

describe("costo del par según la tarifa del laboratorio", () => {
  it("por unidad con todo incluido: dos cristales", () => {
    expect(costoParDeTarifa(base)).toBe(6000);
  });
  it("por par: el costo es del par", () => {
    expect(costoParDeTarifa({ ...base, unidad: "par" })).toBe(3000);
  });
  it("montaje aparte se suma; sin IVA se agrega 19%", () => {
    expect(costoParDeTarifa({ ...base, montaje: "aparte", montaje_costo: 2000 })).toBe(8000);
    expect(costoParDeTarifa({ ...base, montaje: "aparte", montaje_costo: 2000, iva: "mas_iva" })).toBe(9520);
  });
  it("montaje 'no aplica' no suma aunque tenga monto", () => {
    expect(costoParDeTarifa({ ...base, montaje: "no_aplica", montaje_costo: 2000 })).toBe(6000);
  });
});

describe("elegir la tarifa", () => {
  const exacta = { ...base, rango_receta: "±2.00 / ±2.00", costo: 2500 };
  const otroLab = { ...base, proveedor_id: "lab-2", costo: 1000 };
  it("prefiere el rango exacto sobre la tarifa general", () => {
    expect(elegirTarifa([base, exacta], "Monofocal", "Antirreflejo", "±2.00 / ±2.00")?.costo).toBe(2500);
    expect(elegirTarifa([base, exacta], "Monofocal", "Antirreflejo", "±4.00 / ±2.00")?.costo).toBe(3000);
  });
  it("respeta el laboratorio elegido y no inventa tarifas", () => {
    expect(elegirTarifa([base, otroLab], "Monofocal", "Antirreflejo", "x", "lab-2")?.costo).toBe(1000);
    expect(elegirTarifa([base], "Bifocal", "Antirreflejo", "x")).toBeNull();
    expect(elegirTarifa([{ ...base, activo: false }], "Monofocal", "Antirreflejo", "x")).toBeNull();
  });
});
