import { describe, expect, it } from "vitest";
import { filtrarProductos } from "../src/lib/buscar-producto";

const productos = [
  { nombre: "Deportivo verde", marca: "Lacrosse", sku: "LY-2187L C-2", stock: 0 },
  { nombre: "Deportivo morado", marca: "Lacrosse", sku: "LY-2187L C-4", stock: 1 },
  { nombre: "Marco metálico", marca: "Silmo", modelo: "ZD-21126", codigo_color: "C-2", stock: 1 },
];

describe("búsqueda de productos del punto de venta", () => {
  it("encuentra el código completo con o sin guiones y espacios", () => {
    expect(filtrarProductos(productos, "ly 2187l c2")).toEqual([productos[0]]);
    expect(filtrarProductos(productos, "LY2187LC4")).toEqual([productos[1]]);
  });

  it("conserva las variantes y muestra primero la que tiene stock", () => {
    expect(filtrarProductos(productos, "LY-2187L")).toEqual([productos[1], productos[0]]);
  });

  it("permite buscar por modelo y código de color o por nombre sin tildes", () => {
    expect(filtrarProductos(productos, "zd21126c2")).toEqual([productos[2]]);
    expect(filtrarProductos(productos, "metalico")).toEqual([productos[2]]);
  });
});
