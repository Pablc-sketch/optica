import { describe, expect, it } from "vitest";
import { codigoEnDescripcion, prepararCompraMarcos } from "@/lib/compra-marcos";

const marco = {
  orden: "prueba-1", folio: 301, par: 1, sede: "Sede de prueba", propio: false,
  producto: null, codigo: null, descripcion: "Esencial · acetato gris · cód. AA123C2",
  ventasActivas: 1, codigosVenta: ["AA123C2"],
};

describe("lista de compra de marcos", () => {
  it("repone solo el stock negativo de pedidos pendientes y omite marcos propios", () => {
    const pedidos = [301, 302, 303].map(folio => ({ ...marco, folio, orden: `prueba-${folio}`, producto: "pt" }));
    const { filas } = prepararCompraMarcos([
      ...pedidos,
      { ...marco, orden: "marco-propio", propio: true },
      { ...marco, orden: "sin-venta", ventasActivas: 0 },
    ], [{ id: "pt", sku: "AA-123 C-2", marca: "Marca de prueba", proveedor: "Distribuidor", stock: -2 }], [], "Sin proveedor");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ codigo: "AA-123 C-2", stock: -2, pedidos: 3, porComprar: 2 });
  });

  it("suma dos pares del mismo código y calcula lo que falta al guardar un conteo", () => {
    const pedidos = [marco, { ...marco, par: 2 }];
    const { filas: [antes] } = prepararCompraMarcos(pedidos, [], [], "Sin proveedor");
    expect(antes).toMatchObject({ pedidos: 2, enMano: null, porComprar: null, folios: [301] });
    const nota = { clave: antes.clave, revision: antes.revision, en_mano: 1, comprados: 1 };
    const { filas: [guardada] } = prepararCompraMarcos(pedidos, [], [nota], "Sin proveedor");
    expect(guardada).toMatchObject({ enMano: 1, porComprar: 1, comprado: true });
    const { filas: [nueva] } = prepararCompraMarcos([...pedidos, { ...marco, orden: "otro-pedido", folio: 302 }], [], [nota], "Sin proveedor");
    expect(nueva).toMatchObject({ pedidos: 3, enMano: null, porComprar: null, comprado: false });
  });

  it("incluye un marco manual que coincide con el catálogo sin duplicar la rebaja de stock", () => {
    const { filas } = prepararCompraMarcos([
      marco, { ...marco, par: 2, producto: "pt" },
    ], [{ id: "pt", sku: "AA-123 C-2", marca: null, proveedor: "Distribuidor", stock: 0 }], [], "Sin proveedor");
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ pedidos: 2, porComprar: 1 });
  });

  it("pide revisar códigos distintos y permite resolverlos con el campo manual de la OT", () => {
    const dudoso = { ...marco, codigosVenta: ["BB345C1"] };
    const primero = prepararCompraMarcos([dudoso], [], [], "Sin proveedor");
    expect(primero.filas).toHaveLength(0);
    expect(primero.revisar[0]).toMatchObject({ folio: 301, motivo: "En la venta figura BB345C1." });
    const corregido = prepararCompraMarcos([{ ...dudoso, codigo: "AA123C2" }], [], [], "Sin proveedor");
    expect(corregido.revisar).toHaveLength(0);
    expect(corregido.filas[0]).toMatchObject({ codigo: "AA123C2" });
  });

  it("mantiene fuera del pedido colores conflictivos, códigos faltantes y ventas ambiguas", () => {
    const { filas, revisar } = prepararCompraMarcos([
      marco, { ...marco, orden: "otro-color", folio: 302, descripcion: "acetato rosado · cód. AA123C2" },
      { ...marco, orden: "sin-codigo", folio: 303, descripcion: "acetato gris", codigosVenta: [] },
      { ...marco, orden: "venta-ambigua", folio: 304, ventasActivas: 2 },
    ], [], [], "Sin proveedor");
    expect(filas).toHaveLength(0);
    expect(revisar.map(item => item.folio)).toEqual([301, 302, 303, 304]);
    expect(codigoEnDescripcion("CÓD. 0012Q89")).toBe("0012Q89");
    expect(codigoEnDescripcion("AA123C2 NEGRO METAL")).toBe("AA123C2");
  });
});

it("usa el saldo de un código registrado aunque su proveedor esté vacío", () => {
  const { filas } = prepararCompraMarcos([
    { ...marco, producto: "pt" }, { ...marco, par: 2, producto: "pt" },
  ], [{ id: "pt", sku: "AA-123 C-2", marca: null, material: "Metal", proveedor: null, stock: -1 }], [], "Sin proveedor");
  expect(filas[0]).toMatchObject({ porComprar: 1, stock: -1, enMano: null, descripcion: "Metal" });
});
