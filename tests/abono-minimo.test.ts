import { describe, expect, it } from "vitest";
import { abonoMinimoDe } from "../src/lib/abono-minimo";

describe("abonoMinimoDe", () => {
  it("cubre el costo real del cristal más el marco", () => {
    expect(abonoMinimoDe([{ precio: 90000, costoCristal: 41769, minimoFijo: 10000 }], 5000, 90000)).toBe(47000);
  });
  it("nunca baja del mínimo fijo de siempre", () => {
    expect(abonoMinimoDe([{ precio: 38000, costoCristal: 1500, minimoFijo: 10000 }], 5000, 38000)).toBe(10000);
  });
  it("suma los pares, no cobra cortesías y no pasa del total", () => {
    expect(
      abonoMinimoDe(
        [
          { precio: 48000, costoCristal: 9000, minimoFijo: 10000 },
          { precio: 0, costoCristal: 9000, minimoFijo: 10000 },
          { precio: 220000, costoCristal: 39092, minimoFijo: 80000 },
        ],
        5000,
        268000
      )
    ).toBe(14000 + 80000);
  });
});
