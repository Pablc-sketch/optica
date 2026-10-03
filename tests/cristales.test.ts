import { describe, expect, it } from "vitest";
import { dpParaPedido, limitesDeRango, rangoParaPosicion } from "../src/lib/cristales";
import { costoCristal, type CatalogoLaboratorio, type MapaCristal, type Ojo } from "../src/lib/costo-fides";

describe("dpParaPedido", () => {
  it("resta 2 mm a la DP de cerca en pedidos de stock", () => {
    expect(dpParaPedido(66, "cerca", "stock")).toBe(64);
  });

  it("mantiene la DP de lejos en pedidos de stock", () => {
    expect(dpParaPedido(66, "lejos", "stock")).toBe(66);
  });

  it("mantiene la DP original en pedidos de laboratorio", () => {
    expect(dpParaPedido(66, "cerca", "laboratorio")).toBe(66);
  });

  it("mantiene la ausencia de DP", () => {
    expect(dpParaPedido(null, "cerca", "stock")).toBeNull();
  });
});

describe("limitesDeRango", () => {
  it("da la esfera y el cilindro tope de cada casillero", () => {
    expect(limitesDeRango("±2.00 / ±2.00")).toEqual({ esfera: 2, cilindro: 2 });
    expect(limitesDeRango("±6.00 / ±4.00")).toEqual({ esfera: 6, cilindro: 4 });
  });

  it("devuelve null si el texto no corresponde a ningún casillero cargado", () => {
    expect(limitesDeRango("")).toBeNull();
    expect(limitesDeRango("un rango inventado")).toBeNull();
  });
});

describe("origen sin receta cargada (operativo: se refracta y se vende en el momento)", () => {
  // Caso real: Pamela, Monofocal Orgánico Antirreflejo, rango más bajo —
  // antes de este arreglo, sin receta guardada, el POS cobraba siempre el
  // precio de laboratorio ($55.000) aunque el lente fuera clarísimo de
  // stock ($38.000), porque origenReal() no tenía ninguna potencia con la
  // que probar el catálogo. Ahora prueba el peor caso del casillero
  // elegido a mano.
  const mapa: MapaCristal = {
    tipo_lente: "Monofocal",
    material_stock: "CR AR 1.56",
    material_laboratorio: "ORGANICO 1.56 HMC",
    diseno_laboratorio: "MONOFOCAL CONFORT",
    montaje_material: "ORGANICO FOTO O BLUE SIMPLE",
  };
  const catalogo: CatalogoLaboratorio = {
    stock: [
      { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 0, precio_unitario: 670 },
      { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 2, precio_unitario: 670 },
    ],
    laboratorio: [{ diseno: "MONOFOCAL CONFORT", material: "ORGANICO 1.56 HMC", precio_unitario: 3577 }],
    montaje: [{ origen: "stock", material: "ORGANICO FOTO O BLUE SIMPLE", diseno: "MONOFOCAL", precio: 3000 }],
    recargos: [],
    promociones: [],
    descuentoPct: 10,
  };

  it("el peor caso del casillero ±2.00 / ±2.00 ya lo tiene hecho el laboratorio: origen stock", () => {
    const limites = limitesDeRango("±2.00 / ±2.00")!;
    const ojoTope: Ojo = { esfera: limites.esfera, cilindro: limites.cilindro };
    const resultado = costoCristal(mapa, [ojoTope, ojoTope], catalogo, "2026-10-01");
    expect(resultado?.origen).toBe("stock");
  });

  it("un casillero más exigente que no cubre el catálogo de stock cargado cae a laboratorio", () => {
    const limites = limitesDeRango("±6.00 / ±6.00")!;
    const ojoTope: Ojo = { esfera: limites.esfera, cilindro: limites.cilindro };
    const resultado = costoCristal(mapa, [ojoTope, ojoTope], catalogo, "2026-10-01");
    expect(resultado?.origen).toBe("laboratorio");
  });
});


describe("rangoParaPosicion con esfera vacía (F06)", () => {
  it("una receta de solo ADD +2.75 para cerca cae en ±4.00 / ±2.00, igual que el costo", () => {
    expect(rangoParaPosicion([null, null], [null, null], [2.75, 2.75], "cerca")).toBe("±4.00 / ±2.00");
  });

  it("plano explícito (0) y vacío dan lo mismo", () => {
    expect(rangoParaPosicion([0, 0], [null, null], [2.75, 2.75], "cerca")).toBe(
      rangoParaPosicion([null, null], [null, null], [2.75, 2.75], "cerca")
    );
  });

  it("sin esfera ni ADD no inventa potencia", () => {
    expect(rangoParaPosicion([null, null], [null, null], [null, null], "cerca")).toBe("±2.00 / ±2.00");
  });
});
