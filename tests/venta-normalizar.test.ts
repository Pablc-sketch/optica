import { describe, expect, it } from "vitest";
import { normalizarVenta, ubicacionDeCupo, type CristalPedido, type ItemPedido } from "../src/lib/venta-normalizar";

const cristal = (slot: 1 | 2, tratamiento = "Orgánico Antirreflejo"): CristalPedido => ({
  slot,
  tipoLente: "Monofocal",
  rangoReceta: "±2.00 / ±2.00",
  tratamiento,
  posicion: slot === 1 ? "lejos" : "cerca",
});
const itemCristal = (slot: 1 | 2, precio = 38000): ItemPedido => ({
  descripcion: `Cristales ${slot}`,
  cantidad: 1,
  precioUnitario: precio,
  cristalSlot: slot,
});

describe("normalizarVenta — cupos de cristal (F01, folio 62)", () => {
  it("solo Lente 2: pasa a ser el cupo 1 de la orden, y su ítem también", () => {
    const r = normalizarVenta([cristal(2)], [], [itemCristal(2)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.venta.cristales[0].cupo).toBe(1);
    expect(r.venta.items[0].cristalSlot).toBe(1);
  });

  it("solo Lente 1: queda igual", () => {
    const r = normalizarVenta([cristal(1)], [], [itemCristal(1)]);
    if (!r.ok) throw new Error(r.error);
    expect(r.venta.cristales[0].cupo).toBe(1);
    expect(r.venta.items[0].cristalSlot).toBe(1);
  });

  it("ambos lentes, llegando en desorden: cada uno con su ítem y su marco", () => {
    const r = normalizarVenta(
      [cristal(2, "Orgánico Filtro Azul"), cristal(1)],
      [
        { slot: 2, productoId: "marco-cerca", marcoPropio: false },
        { slot: 1, productoId: null, marcoPropio: true },
      ],
      [itemCristal(2, 48000), itemCristal(1, 38000)]
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.venta.cristales.map((c) => [c.cupo, c.tratamiento])).toEqual([
      [1, "Orgánico Antirreflejo"],
      [2, "Orgánico Filtro Azul"],
    ]);
    expect(r.venta.marcoDeCupo[1]?.marcoPropio).toBe(true);
    expect(r.venta.marcoDeCupo[2]?.productoId).toBe("marco-cerca");
    const filtroAzul = r.venta.items.find((i) => i.precioUnitario === 48000)!;
    expect(filtroAzul.cristalSlot).toBe(2);
  });

  it("solo Lente 2 con su marco: el marco va al mismo cupo que el lente", () => {
    const r = normalizarVenta([cristal(2)], [{ slot: 2, productoId: "m2", marcoPropio: false }], [itemCristal(2)]);
    if (!r.ok) throw new Error(r.error);
    expect(r.venta.marcoDeCupo[1]?.productoId).toBe("m2");
    expect(r.venta.marcoDeCupo[2]).toBeUndefined();
  });

  it("antes un marco del Lente 2 terminaba en el cupo del Lente 1: ya no", () => {
    const r = normalizarVenta(
      [cristal(1), cristal(2)],
      [{ slot: 2, productoId: "solo-del-2", marcoPropio: false }],
      [itemCristal(1), itemCristal(2)]
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.venta.marcoDeCupo[1]).toBeUndefined();
    expect(r.venta.marcoDeCupo[2]?.productoId).toBe("solo-del-2");
  });

  it("rechaza un ítem de cristal sin su cristal, o un cristal sin cobro", () => {
    expect(normalizarVenta([], [], [itemCristal(1)]).ok).toBe(false);
    expect(normalizarVenta([cristal(1)], [], [{ descripcion: "marco", cantidad: 1, precioUnitario: 0 }]).ok).toBe(false);
  });

  it("rechaza cupos repetidos", () => {
    expect(normalizarVenta([cristal(1), cristal(1)], [], [itemCristal(1)]).ok).toBe(false);
  });
});

describe("normalizarVenta — montos (A07)", () => {
  it("rechaza cantidades negativas, cero o con decimales, y precios negativos", () => {
    const marco = (cantidad: number, precioUnitario: number) => [{ descripcion: "Marco", cantidad, precioUnitario }];
    expect(normalizarVenta([], [], marco(-2, 100)).ok).toBe(false);
    expect(normalizarVenta([], [], marco(0, 100)).ok).toBe(false);
    expect(normalizarVenta([], [], marco(1.5, 100)).ok).toBe(false);
    expect(normalizarVenta([], [], marco(1, -100)).ok).toBe(false);
    expect(normalizarVenta([], [], marco(1, Number.NaN)).ok).toBe(false);
  });

  it("acepta un regalo ($0) explícito", () => {
    expect(normalizarVenta([cristal(1)], [], [itemCristal(1, 0)]).ok).toBe(true);
  });

  it("rechaza una venta vacía", () => {
    expect(normalizarVenta([], [], []).ok).toBe(false);
  });
});

describe("varios pares en una venta", () => {
  const cristal = (slot: number) => ({ slot, tipoLente: "Monofocal", rangoReceta: "±2.00 / ±2.00", tratamiento: "AR" });
  const item = (slot: number) => ({ descripcion: `par ${slot}`, cantidad: 1, precioUnitario: 1000, cristalSlot: slot });

  it("acepta tres pares y los numera seguido aunque falte uno en medio", () => {
    const r = normalizarVenta([cristal(1), cristal(2), cristal(4)], [{ slot: 4, productoId: "m4", marcoPropio: false }], [item(1), item(2), item(4)]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.venta.cristales.map((c) => c.cupo)).toEqual([1, 2, 3]);
    expect(r.venta.items.map((i) => i.cristalSlot)).toEqual([1, 2, 3]);
    expect(r.venta.marcoDeCupo[3]?.productoId).toBe("m4");
  });

  it("rechaza más del máximo", () => {
    const n = [1, 2, 3, 4, 5, 6, 7];
    const r = normalizarVenta(n.map(cristal), [], n.map(item));
    expect(r.ok).toBe(false);
  });

  it("ubica cada par en su orden y cupo", () => {
    expect([1, 2, 3, 4, 5].map(ubicacionDeCupo)).toEqual([
      { orden: 0, slot: 1 },
      { orden: 0, slot: 2 },
      { orden: 1, slot: 1 },
      { orden: 1, slot: 2 },
      { orden: 2, slot: 1 },
    ]);
  });
});
