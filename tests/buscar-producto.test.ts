import { describe, expect, it } from "vitest";
import { filtrarProductos, sugerirDetallesMarco, sugerirMarcosPorCodigo } from "../src/lib/buscar-producto";

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

  it("acota los códigos por prefijo y deja solo el exacto frente a códigos más largos", () => {
    const marcos = [
      { nombre: "Primero", marca: null, sku: "XZ318 C-1", stock: 0 },
      { nombre: "Segundo", marca: null, sku: "XZ318 C-10", stock: 2 },
    ];
    expect(sugerirMarcosPorCodigo(marcos, "xz318c")).toEqual([marcos[1], marcos[0]]);
    expect(sugerirMarcosPorCodigo(marcos, "xz318 c1")).toEqual([marcos[0]]);
    expect(sugerirMarcosPorCodigo(marcos, "XZ318 C-3")).toEqual([]);
  });

  it("sugiere detalles según lo escrito y admite palabras sin coincidencia", () => {
    expect(sugerirDetallesMarco(["Dorado", "Café", "cafe", "Plateado"], "caf")).toEqual(["Café"]);
    expect(sugerirDetallesMarco(["Acetato", "Metal", "TR90"], "met")).toEqual(["Metal"]);
    expect(sugerirDetallesMarco(["Dorado", "Café"], "Verde agua")).toEqual([]);
  });

  it("permite buscar por modelo y código de color o por nombre sin tildes", () => {
    expect(filtrarProductos(productos, "zd21126c2")).toEqual([productos[2]]);
    expect(filtrarProductos(productos, "metalico")).toEqual([productos[2]]);
  });
});
