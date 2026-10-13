import { describe, expect, it } from "vitest";
import { COSTO_MARCO_POR_PAR, desglosarCostos } from "../src/lib/costo-venta";

const ot = { costo_laboratorio: 10000, costo_laboratorio_2: 12000 };

describe("costo de marcos por par", () => {
  it("cada par de cristales suma un marco, tenga o no marco del inventario", () => {
    const d = desglosarCostos([
      { cantidad: 1, cristal_slot: 1, ordenes_trabajo: ot },
      { cantidad: 1, cristal_slot: 2, ordenes_trabajo: ot },
      // Marco del inventario de uno de esos pares: no se cobra de nuevo.
      { cantidad: 1, productos: { costo: 9999, categoria: "armazon" } },
      // Marco descrito a mano (sin producto) y consulta: sin costo propio.
      { cantidad: 1, descripcion: "Marco acetato negro" },
    ]);
    expect(d.marcos).toBe(2);
    expect(d.totalArmazones).toBe(2 * COSTO_MARCO_POR_PAR);
    expect(d.total).toBe(10000 + 12000 + 2 * COSTO_MARCO_POR_PAR);
  });
});
