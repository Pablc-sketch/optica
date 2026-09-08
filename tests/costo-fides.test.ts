import { describe, expect, it } from "vitest";
import {
  costoCristal,
  precioStockOjo,
  recargoOjo,
  type CatalogoLaboratorio,
  type MapaCristal,
} from "../src/lib/costo-fides";

// Recorte de la lista Fides 2026 con los materiales que aparecen en la
// nota de venta 53160 (08/09/2026), que es contra la que se cuadra todo.
const CATALOGO: CatalogoLaboratorio = {
  descuentoPct: 10,
  promociones: [
    {
      diseno: "MULTIFOCAL ADVANCE",
      material: null,
      descuento_pct: 50,
      desde: "2026-09-01",
      hasta: "2026-09-30",
      nota: "Promoción de septiembre",
    },
  ],
  stock: [
    // CR AR 1.56 ("CR CAPA 12" en la boleta)
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 0, precio_unitario: 670 },
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 0, precio_unitario: 670 },
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 2, precio_unitario: 670 },
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 4, precio_unitario: 1850 },
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 4, precio_unitario: 1850 },
    // CR AR BLUE 1.56 ("CR BLUE 33")
    { material: "CR AR BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 0, precio_unitario: 1700 },
    { material: "CR AR BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 0, precio_unitario: 1700 },
    { material: "CR AR BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 2, precio_unitario: 1700 },
    // CR AR FOTO GRIS BLUE 1.56 ("CR FOTO FILTRO AZUL 37")
    { material: "CR AR FOTO GRIS BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 0, cilindro_max: 6, precio_unitario: 12000 },
    { material: "CR AR FOTO GRIS BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 2, precio_unitario: 3700 },
    { material: "CR AR FOTO GRIS BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 6, precio_unitario: 12000 },
    { material: "CR AR FOTO GRIS BLUE 1.56", diseno: "MONOFOCAL", esfera_max: 4, cilindro_max: 6, precio_unitario: 12000 },
    // Multifocal de stock: rango fijo, sin grilla de potencias.
    { material: "MULTIFOCAL ANTIREFLEJO 1.56", diseno: "MULTIFOCAL", esfera_max: null, cilindro_max: null, precio_unitario: 8500 },
  ],
  laboratorio: [
    { diseno: "MULTIFOCAL ADVANCE", material: "ORGANICO BLUE FILTER 1.56 HMC", precio_unitario: 34000 },
    { diseno: "MONOFOCAL CONFORT", material: "ORGANICO POLARIZADO 1.49 HMC", precio_unitario: 12500 },
  ],
  montaje: [
    { origen: "stock", material: "ORGANICO SIMPLE", diseno: "MONOFOCAL", precio: 2000 },
    { origen: "stock", material: "ORGANICO FOTO O BLUE SIMPLE", diseno: "MONOFOCAL", precio: 3000 },
    { origen: "laboratorio", material: "CERRADO", diseno: "MONOFOCAL", precio: 3000 },
    { origen: "laboratorio", material: "CERRADO", diseno: "MULTIFOCAL", precio: 4500 },
  ],
  recargos: [
    { categoria: "cilindro", concepto: "CYL SOBRE +/- 4", precio: 1500 },
    { categoria: "cilindro", concepto: "CYL SOBRE +/- 6", precio: 3000 },
    { categoria: "esfera", concepto: "ESF SOBRE +/- 10", precio: 3500 },
  ],
};

// Un martes de septiembre, con la promoción del ADVANCE vigente.
const DIA = "2026-09-08";

const AR: MapaCristal = {
  tipo_lente: "Monofocal",
  material_stock: "CR AR 1.56",
  material_laboratorio: "ORGANICO 1.56 HMC",
  diseno_laboratorio: "MONOFOCAL CONFORT",
  montaje_material: "ORGANICO SIMPLE",
};
const BLUE: MapaCristal = { ...AR, material_stock: "CR AR BLUE 1.56", montaje_material: "ORGANICO FOTO O BLUE SIMPLE" };
const FOTO: MapaCristal = { ...BLUE, material_stock: "CR AR FOTO GRIS BLUE 1.56" };
const POLARIZADO: MapaCristal = {
  tipo_lente: "Monofocal",
  material_stock: null,
  material_laboratorio: "ORGANICO POLARIZADO 1.49 HMC",
  diseno_laboratorio: "MONOFOCAL CONFORT",
  montaje_material: "ORGANICO FOTO O BLUE SIMPLE",
};
const MULTIFOCAL: MapaCristal = {
  tipo_lente: "Multifocal",
  material_stock: "MULTIFOCAL ANTIREFLEJO 1.56",
  material_laboratorio: "ORGANICO BLUE FILTER 1.56 HMC",
  diseno_laboratorio: "MULTIFOCAL ADVANCE",
  montaje_material: "ORGANICO FOTO O BLUE SIMPLE",
};

describe("precioStockOjo: la celda más barata que cubre el ojo", () => {
  it("cobra la columna de cilindro solo cuando la esfera es plana", () => {
    // Folio 50: 0.00 -4.50. La boleta cobró $12.000, no la celda combinada.
    expect(precioStockOjo("CR AR FOTO GRIS BLUE 1.56", { esfera: 0, cilindro: -4.5 }, CATALOGO.stock)).toBe(12000);
  });

  it("cobra distinto cada ojo de una receta despareja", () => {
    // Folio 47, tal como salió en la boleta: un ojo $670 y el otro $1.850.
    expect(precioStockOjo("CR AR 1.56", { esfera: 2.25, cilindro: -2 }, CATALOGO.stock)).toBe(670);
    expect(precioStockOjo("CR AR 1.56", { esfera: 2, cilindro: -2.25 }, CATALOGO.stock)).toBe(1850);
  });

  it("devuelve null cuando ninguna celda alcanza a cubrir el ojo", () => {
    expect(precioStockOjo("CR AR BLUE 1.56", { esfera: 0, cilindro: -5 }, CATALOGO.stock)).toBeNull();
  });
});

describe("recargoOjo", () => {
  it("no cobra recargo dentro de lo corriente", () => {
    expect(recargoOjo({ esfera: -3.5, cilindro: -2 }, CATALOGO.recargos)).toBe(0);
  });

  it("cobra el escalón de cilindro que corresponde", () => {
    expect(recargoOjo({ esfera: 0, cilindro: -4.75 }, CATALOGO.recargos)).toBe(1500);
    expect(recargoOjo({ esfera: 0, cilindro: -6.5 }, CATALOGO.recargos)).toBe(3000);
  });
});

describe("costoCristal: cuadra con la nota de venta 53160 de Fides", () => {
  it("orgánico antirreflejo simétrico (folio 39)", () => {
    // (670 + 670 + 2.000) × 0,9 × 1,19
    const r = costoCristal(AR, [{ esfera: 1.25, cilindro: null }, { esfera: 1.25, cilindro: null }], CATALOGO, DIA)!;
    expect(r.origen).toBe("stock");
    expect(r.costo).toBe(3577);
  });

  it("cobra por ojo cuando la receta es despareja (folio 47)", () => {
    // (670 + 1.850 + 2.000) × 0,9 × 1,19
    const r = costoCristal(AR, [{ esfera: 2.25, cilindro: -2 }, { esfera: 2, cilindro: -2.25 }], CATALOGO, DIA)!;
    expect(r.unitarios).toEqual([670, 1850]);
    expect(r.costo).toBe(4841);
  });

  it("filtro azul (folio 37)", () => {
    // (1.700 + 1.700 + 3.000) × 0,9 × 1,19
    const r = costoCristal(BLUE, [{ esfera: 0, cilindro: -0.5 }, { esfera: 0, cilindro: -0.75 }], CATALOGO, DIA)!;
    expect(r.costo).toBe(6854);
  });

  it("cilindro alto sin esfera sale de stock, no tallado (folio 50)", () => {
    // Es el caso que antes se cotizaba como si fuera a medida.
    const r = costoCristal(FOTO, [{ esfera: 0, cilindro: -4.5 }, { esfera: 0, cilindro: -4.75 }], CATALOGO, DIA)!;
    expect(r.origen).toBe("stock");
    expect(r.costo).toBe(28917);
  });

  it("fotocromático corriente sale mucho más barato (folio 51)", () => {
    const r = costoCristal(FOTO, [{ esfera: -3.5, cilindro: -0.75 }, { esfera: -3.5, cilindro: -0.75 }], CATALOGO, DIA)!;
    expect(r.costo).toBe(11138);
  });

  it("el polarizado siempre se talla: el laboratorio no lo tiene hecho (folio 43)", () => {
    // (12.500 + 12.500 + 3.000) × 0,9 × 1,19
    const r = costoCristal(POLARIZADO, [{ esfera: -2.5, cilindro: null }, { esfera: 0.25, cilindro: null }], CATALOGO, DIA)!;
    expect(r.origen).toBe("laboratorio");
    expect(r.costo).toBe(29988);
  });

  it("el multifocal se talla cuando la esfera se pasa del rango de stock (folio 44)", () => {
    // OI +3.25 se sale del tope +3.00 de la caja de stock.
    const r = costoCristal(MULTIFOCAL, [{ esfera: 2.25, cilindro: -0.5 }, { esfera: 3.25, cilindro: -1.25 }], CATALOGO, DIA)!;
    expect(r.origen).toBe("laboratorio");
    // Cristales al 50% (promo de septiembre) y montaje al 10% de siempre:
    // 34.000 × 2 × 0,5 + 4.500 × 0,9, todo × 1,19. Es lo que cobró la
    // boleta: $34.000 de cristales y $4.050 de montaje.
    expect(r.promocion?.descuento_pct).toBe(50);
    expect(r.costo).toBe(45280);
    expect(r.costoSinPromocion).toBe(77648);
  });

  it("los dos descuentos no se suman: manda el mayor, y solo sobre el cristal", () => {
    const r = costoCristal(MULTIFOCAL, [{ esfera: 3.25, cilindro: 0 }, { esfera: 3.25, cilindro: 0 }], CATALOGO, DIA)!;
    // Si se sumaran (50% y luego 10%) el cristal quedaría en $30.600.
    expect(r.costo).toBe(45280);
  });

  it("cuando se acaba la promoción el multifocal vuelve a costar el doble", () => {
    // Lo que va a pasar solo el 1 de octubre: sin esto la app seguiría
    // cotizando con el precio de septiembre.
    const r = costoCristal(
      MULTIFOCAL,
      [{ esfera: 2.25, cilindro: -0.5 }, { esfera: 3.25, cilindro: -1.25 }],
      CATALOGO,
      "2026-10-01"
    )!;
    expect(r.promocion).toBeNull();
    expect(r.costo).toBe(77648);
  });

  it("la promoción no alcanza a un diseño que no cubre", () => {
    const r = costoCristal(POLARIZADO, [{ esfera: -2.5, cilindro: null }, { esfera: 0.25, cilindro: null }], CATALOGO, DIA)!;
    expect(r.promocion).toBeNull();
    expect(r.costo).toBe(r.costoSinPromocion);
  });

  it("el multifocal sale de stock si la receta entra en el rango", () => {
    const r = costoCristal(MULTIFOCAL, [{ esfera: 1.5, cilindro: -0.5 }, { esfera: 1.5, cilindro: -0.5 }], CATALOGO, DIA)!;
    expect(r.origen).toBe("stock");
  });

  it("no inventa un costo cuando el laboratorio no hace esa combinación", () => {
    expect(costoCristal({ ...AR, material_stock: null, material_laboratorio: null }, [{ esfera: 0, cilindro: 0 }], CATALOGO, DIA)).toBeNull();
  });
});
