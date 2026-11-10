import { describe, expect, it } from "vitest";
import { desglosarCostos } from "../src/lib/costo-venta";

// El de Óptica Global; cada óptica tiene el suyo en su configuración.
const COSTO_MARCO_POR_PAR = 5000;

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
    ], COSTO_MARCO_POR_PAR);
    expect(d.marcos).toBe(2);
    expect(d.totalArmazones).toBe(2 * COSTO_MARCO_POR_PAR);
    expect(d.total).toBe(10000 + 12000 + 2 * COSTO_MARCO_POR_PAR);
  });
});

describe("costo de marco guardado en cada venta", () => {
  const ot = { costo_laboratorio: 10000, costo_laboratorio_2: null };
  it("usa el costo guardado al vender; el de la óptica solo para ventas antiguas", () => {
    const d = desglosarCostos([
      { cantidad: 1, cristal_slot: 1, costo_marco: 7000, ordenes_trabajo: ot },
      { cantidad: 1, cristal_slot: 1, costo_marco: null, ordenes_trabajo: ot },
    ], 5000);
    expect(d.totalArmazones).toBe(7000 + 5000);
  });
  it("una óptica sin costo de marco configurado no inventa uno", () => {
    expect(desglosarCostos([{ cantidad: 2, cristal_slot: 1, ordenes_trabajo: ot }], 0).totalArmazones).toBe(0);
  });
});
