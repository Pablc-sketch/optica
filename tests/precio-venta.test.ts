import { describe, expect, it } from "vitest";
import type { CatalogoLaboratorio } from "../src/lib/costo-fides";
import {
  costoRealCristal,
  ojosParaCristal,
  origenCristal,
  precioVentaCristal,
  type FilaCristal,
  type PotenciasReceta,
} from "../src/lib/precio-venta";

const DIA = "2026-10-02";

const CATALOGO: CatalogoLaboratorio = {
  stock: [
    { material: "CR AR 1.56", diseno: "MONOFOCAL", esfera_max: 2, cilindro_max: 2, precio_unitario: 670 },
    { material: "MULTIFOCAL ANTIREFLEJO 1.56", diseno: "MULTIFOCAL", esfera_max: null, cilindro_max: null, precio_unitario: 8500 },
  ],
  laboratorio: [
    { diseno: "MONOFOCAL CONFORT", material: "ORGANICO 1.56 HMC", precio_unitario: 3577 },
    { diseno: "MULTIFOCAL CONFORT", material: "ORGANICO 1.56 HMC", precio_unitario: 20000 },
  ],
  montaje: [
    { origen: "stock", material: "ORGANICO SIMPLE", diseno: "MONOFOCAL", precio: 2000 },
    { origen: "stock", material: "ORGANICO SIMPLE", diseno: "MULTIFOCAL", precio: 7000 },
    { origen: "laboratorio", material: "CERRADO", diseno: "MULTIFOCAL", precio: 4500 },
  ],
  recargos: [],
  promociones: [],
  descuentoPct: 10,
};

const MONO_AR: FilaCristal = {
  tipo_lente: "Monofocal",
  tratamiento: "Orgánico Antirreflejo",
  rango_receta: "±2.00 / ±2.00",
  costo: 19278,
  precio_venta: 55000,
  precio_venta_stock: 38000,
  material_stock: "CR AR 1.56",
  material_laboratorio: "ORGANICO 1.56 HMC",
  diseno_laboratorio: "MONOFOCAL CONFORT",
  montaje_material: "ORGANICO SIMPLE",
};

const MULTI_AR: FilaCristal = {
  tipo_lente: "Multifocal",
  tratamiento: "Multifocal Antirreflejo",
  rango_receta: "±4.00 / ±2.00",
  costo: 62654,
  precio_venta: 180000,
  // Un precio de stock que alguien dejó cargado: igual no se debe usar.
  precio_venta_stock: 105000,
  material_stock: "MULTIFOCAL ANTIREFLEJO 1.56",
  material_laboratorio: "ORGANICO 1.56 HMC",
  diseno_laboratorio: "MULTIFOCAL CONFORT",
  montaje_material: "ORGANICO SIMPLE",
};

const receta = (r: Partial<PotenciasReceta>): PotenciasReceta => ({
  od_esfera: null,
  od_cilindro: null,
  od_add: null,
  oi_esfera: null,
  oi_cilindro: null,
  oi_add: null,
  ...r,
});

describe("ojosParaCristal", () => {
  it("un monofocal de cerca suma la adición a la esfera", () => {
    const ojos = ojosParaCristal(receta({ od_esfera: 1.75, od_add: 2.5, oi_esfera: 1.75, oi_add: 2.5 }), "Monofocal", "cerca");
    expect(ojos[0].esfera).toBe(4.25);
  });

  it("un multifocal NO suma la adición, pero la lleva aparte", () => {
    const ojos = ojosParaCristal(receta({ od_esfera: 1.75, od_add: 2.5 }), "Multifocal", "lejos");
    expect(ojos[0].esfera).toBe(1.75);
    expect(ojos[0].add).toBe(2.5);
  });
});

describe("precioVentaCristal: lo que se le cobra al paciente", () => {
  it("monofocal de stock: precio de stock ($38.000, no $55.000)", () => {
    const r = receta({ od_esfera: -0.25, od_cilindro: -0.5, oi_esfera: 0.25, oi_cilindro: -0.5 });
    const origen = origenCristal(MONO_AR, r, "lejos", CATALOGO, DIA);
    expect(origen).toBe("stock");
    expect(precioVentaCristal(MONO_AR, origen)).toBe(38000);
  });

  it("monofocal tallado: precio de laboratorio", () => {
    expect(precioVentaCristal(MONO_AR, "laboratorio")).toBe(55000);
  });

  it("multifocal: siempre el mismo precio, salga de stock o de laboratorio", () => {
    expect(precioVentaCristal(MULTI_AR, "stock")).toBe(180000);
    expect(precioVentaCristal(MULTI_AR, "laboratorio")).toBe(180000);
  });

  it("multifocal sin cilindro dentro de la caja: se pide de stock (más barato para la óptica) y se cobra igual", () => {
    const r = receta({ od_esfera: 2, od_add: 2, oi_esfera: 1.75, oi_add: 2 });
    const costo = costoRealCristal(MULTI_AR, r, "lejos", CATALOGO, DIA)!;
    expect(costo.origen).toBe("stock");
    expect(precioVentaCristal(MULTI_AR, costo.origen)).toBe(180000);
  });

  it("multifocal con cilindro: se pide al laboratorio", () => {
    const r = receta({ od_esfera: 2.75, od_cilindro: -0.5, od_add: 2.5, oi_esfera: 2.5, oi_cilindro: -0.5, oi_add: 2.5 });
    expect(origenCristal(MULTI_AR, r, "lejos", CATALOGO, DIA)).toBe("laboratorio");
  });

  it("sin precio fijado en /precios, cae al factor sobre el costo", () => {
    expect(precioVentaCristal({ ...MONO_AR, precio_venta: 0, precio_venta_stock: null }, "laboratorio", 2.5)).toBe(48195);
  });
});

describe("sin receta guardada (operativo)", () => {
  it("monofocal del rango más bajo: el peor caso igual sale de stock", () => {
    expect(origenCristal(MONO_AR, null, "lejos", CATALOGO, DIA)).toBe("stock");
  });

  it("multifocal: sin saber si trae cilindro, se cotiza tallado", () => {
    expect(origenCristal(MULTI_AR, null, "lejos", CATALOGO, DIA)).toBe("laboratorio");
  });
});
