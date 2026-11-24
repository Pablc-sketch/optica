import { describe, expect, it } from "vitest";
import { marcoPorCodigo } from "@/lib/buscar-producto";
import { leerCargaMarcos } from "@/lib/carga-marcos";

describe("Stock de marcos por código", () => {
  it("suma líneas repetidas y acepta dos columnas de Excel sin mezclar colores", () => {
    const texto = "ly-2187l C-2; 3\nLY2187LC2\nLY-2187L C-4\t2\n522C1";
    expect(leerCargaMarcos(texto, "entrada")).toEqual({ filas: [
      { codigo: "LY-2187L C-2", cantidad: 4 },
      { codigo: "LY-2187L C-4", cantidad: 2 },
      { codigo: "522C1", cantidad: 1 },
    ] });
  });

  it("exige el total explícito de cada código contado y acepta contar cero", () => {
    expect(leerCargaMarcos("522C1;0", "conteo")).toEqual({ filas: [{ codigo: "522C1", cantidad: 0 }] });
    expect(leerCargaMarcos("522C1", "conteo")).toMatchObject({ filas: [], error: expect.stringContaining("Línea 1") });
    expect(leerCargaMarcos("522C1;2\n522-C1;1", "conteo")).toMatchObject({ filas: [], error: expect.stringContaining("Línea 2") });
  });

  it("solo elige un código completo inequívoco", () => {
    const base = { nombre: "Lacrosse", marca: "Lacrosse" };
    const productos = [{ ...base, sku: "LY-2187L C-2" }, { ...base, sku: "LY-2187L C-4" }];
    expect(marcoPorCodigo(productos, "ly2187lc4")).toBe(productos[1]);
    expect(marcoPorCodigo(productos, "ly2187l")).toBeUndefined();
    expect(marcoPorCodigo([...productos, { ...base, sku: "LY2187LC4" }], "ly2187lc4")).toBeUndefined();
  });
});
