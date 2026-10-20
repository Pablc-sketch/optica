import { describe, expect, it } from "vitest";
import { abonoMinimoDe, tasaDelMedio } from "../src/lib/abono-minimo";

const foto = [{ precio: 90000, costoCristal: 41769, minimoFijo: 10000 }];

describe("abonoMinimoDe", () => {
  it("efectivo: cubre cristal + marco", () => {
    expect(abonoMinimoDe(foto, 5000, 90000, 0)).toEqual({ monto: 47000, noCubre: false });
  });
  it("crédito 2,96%: cobra de más para que lleguen los $46.769", () => {
    const r = abonoMinimoDe(foto, 5000, 90000, 2.96);
    expect(r.monto).toBe(49000);
    expect(r.monto * (1 - 0.0296)).toBeGreaterThanOrEqual(46769);
  });
  it("débito 2,13%", () => {
    const r = abonoMinimoDe(foto, 5000, 90000, 2.13);
    expect(r.monto).toBe(48000);
    expect(r.monto * (1 - 0.0213)).toBeGreaterThanOrEqual(46769);
  });
  it("nunca baja del mínimo fijo de siempre", () => {
    expect(abonoMinimoDe([{ precio: 38000, costoCristal: 1500, minimoFijo: 10000 }], 5000, 38000).monto).toBe(10000);
  });
  it("suma los pares y no cobra cortesías", () => {
    expect(
      abonoMinimoDe(
        [
          { precio: 48000, costoCristal: 9000, minimoFijo: 10000 },
          { precio: 0, costoCristal: 9000, minimoFijo: 10000 },
          { precio: 220000, costoCristal: 39092, minimoFijo: 80000 },
        ],
        5000,
        268000
      ).monto
    ).toBe(14000 + 80000);
  });
  it("si el costo pasa el precio, avisa que no cubre", () => {
    expect(abonoMinimoDe([{ precio: 20000, costoCristal: 30000, minimoFijo: 10000 }], 5000, 20000)).toEqual({
      monto: 20000,
      noCubre: true,
    });
  });
  it("tasa por medio", () => {
    expect(tasaDelMedio("credito", 2.13, 2.96)).toBe(2.96);
    expect(tasaDelMedio("debito", 2.13, 2.96)).toBe(2.13);
    expect(tasaDelMedio("efectivo", 2.13, 2.96)).toBe(0);
    expect(tasaDelMedio("transferencia", 2.13, 2.96)).toBe(0);
  });
});
