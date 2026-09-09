import { describe, expect, it } from "vitest";
import { calcularSueldos, sumarDesgloses, type ParametrosSueldo } from "../src/lib/sueldos";

const PARAMS: ParametrosSueldo = { comisionVendedoraPct: 10, comisionVendedoraBase: "venta_total", ahorroPct: 20 };

describe("calcularSueldos", () => {
  it("reparte comisión (venta), ahorro y el resto 50/50", () => {
    // Venta 1.000.000, utilidad neta 500.000.
    const r = calcularSueldos(1_000_000, 500_000, PARAMS);
    expect(r.comisionIsadora).toBe(100_000); // 10% de la venta
    expect(r.utilidadDisponible).toBe(400_000); // 500.000 - 100.000
    expect(r.ahorro).toBe(80_000); // 20% de 400.000
    expect(r.restoParaDividir).toBe(320_000);
    expect(r.parteMadre).toBe(160_000);
    expect(r.partePablo).toBe(160_000);
  });

  it("la comisión sobre la venta no depende de la utilidad", () => {
    // Isadora vendió igual aunque los costos se hayan comido el margen.
    const r = calcularSueldos(1_000_000, 50_000, PARAMS);
    expect(r.comisionIsadora).toBe(100_000);
    expect(r.utilidadDisponible).toBe(-50_000);
    expect(r.ahorro).toBe(0);
    expect(r.restoParaDividir).toBe(0);
    expect(r.parteMadre).toBe(0);
    expect(r.partePablo).toBe(0);
  });

  it("calcula la comisión sobre la utilidad cuando esa es la base elegida", () => {
    const params: ParametrosSueldo = { ...PARAMS, comisionVendedoraBase: "utilidad_neta" };
    const r = calcularSueldos(1_000_000, 500_000, params);
    expect(r.comisionIsadora).toBe(50_000); // 10% de la utilidad, no de la venta
    expect(r.utilidadDisponible).toBe(450_000);
  });

  it("nunca paga comisión negativa cuando la base es utilidad y hubo pérdida", () => {
    const params: ParametrosSueldo = { ...PARAMS, comisionVendedoraBase: "utilidad_neta" };
    const r = calcularSueldos(300_000, -20_000, params);
    expect(r.comisionIsadora).toBe(0);
    expect(r.utilidadDisponible).toBe(-20_000);
    expect(r.ahorro).toBe(0);
    expect(r.restoParaDividir).toBe(0);
  });

  it("nunca reparte plata negativa a la mamá o a Pablo", () => {
    // Operativo con pérdida grande: la comisión de Isadora (sobre venta)
    // deja la utilidad disponible bien en rojo.
    const r = calcularSueldos(100_000, -50_000, PARAMS);
    expect(r.comisionIsadora).toBe(10_000);
    expect(r.utilidadDisponible).toBe(-60_000);
    expect(r.restoParaDividir).toBe(0);
    expect(r.parteMadre).toBe(0);
    expect(r.partePablo).toBe(0);
  });

  it("las dos mitades siempre suman el resto exacto, incluso con montos impares", () => {
    const r = calcularSueldos(0, 100_001, { comisionVendedoraPct: 0, comisionVendedoraBase: "venta_total", ahorroPct: 0 });
    expect(r.parteMadre + r.partePablo).toBe(r.restoParaDividir);
    expect(r.restoParaDividir).toBe(100_001);
  });

  it("cuadra con un operativo real: venta 907.736, utilidad neta 530.974", () => {
    const r = calcularSueldos(907_736, 530_974, PARAMS);
    expect(r.comisionIsadora).toBe(90_774); // 10% de 907.736, redondeado
    expect(r.utilidadDisponible).toBe(440_200);
    expect(r.ahorro).toBe(88_040); // 20% de 440.200
    expect(r.restoParaDividir).toBe(352_160);
    expect(r.parteMadre).toBe(176_080);
    expect(r.partePablo).toBe(176_080);
  });
});

describe("sumarDesgloses", () => {
  it("suma varios operativos del mismo mes en un solo total", () => {
    const a = calcularSueldos(200_000, 100_000, PARAMS);
    const b = calcularSueldos(300_000, 150_000, PARAMS);
    const total = sumarDesgloses([a, b]);
    expect(total.ventaTotal).toBe(500_000);
    expect(total.comisionIsadora).toBe(a.comisionIsadora + b.comisionIsadora);
    expect(total.parteMadre).toBe(a.parteMadre + b.parteMadre);
    expect(total.partePablo).toBe(a.partePablo + b.partePablo);
  });

  it("una lista vacía (mes sin operativos) da todo en cero", () => {
    const total = sumarDesgloses([]);
    expect(total.ventaTotal).toBe(0);
    expect(total.parteMadre).toBe(0);
    expect(total.partePablo).toBe(0);
  });
});
