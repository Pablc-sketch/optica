import { expect, it } from "vitest";
import { prepararCodigoDeMarco } from "@/lib/ficha-marco";
import { filtrarProductos, marcoPorCodigo } from "@/lib/buscar-producto";

it("admite códigos con o sin un color indicado", () => {
  expect(prepararCodigoDeMarco("zb123", "")).toEqual({ codigo: "ZB123", modelo: "ZB123", codigoColor: null });
  expect(prepararCodigoDeMarco("zb123", "c-1")).toEqual({ codigo: "ZB123 C1", modelo: "ZB123", codigoColor: "C1" });
  expect(prepararCodigoDeMarco("ZB123 C-4A", "")).toEqual({ codigo: "ZB123 C-4A", modelo: "ZB123", codigoColor: "C4A" });
  expect(prepararCodigoDeMarco("ZB123C01", "c01")).toEqual({ codigo: "ZB123C01", modelo: "ZB123", codigoColor: "C01" });
});

it("avisa al ingresar un color que contradice el código completo", () => {
  expect(prepararCodigoDeMarco("ZB123 C-2", "C1")).toMatchObject({ error: expect.stringContaining("C2") });
  expect(prepararCodigoDeMarco("ZB123", "rojo")).toHaveProperty("error");
});

it("permite buscar por descripción y mantiene la selección exacta por variante", () => {
  const filas = [
    { nombre: "Marco A", sku: "ZB123 C-1", marca: "Marca de prueba", material: "Acetato", color: "Azul", codigo_color: "C-1" },
    { nombre: "Marco B", sku: "ZB123 C-2", marca: null, material: "Metal", color: "Rojo", codigo_color: "C-2" },
  ];
  expect(filtrarProductos(filas, "azul acetato c1")).toEqual([filas[0]]);
  expect(filtrarProductos(filas, "metal rojo")).toEqual([filas[1]]);
  expect(marcoPorCodigo(filas, "ZB123")).toBeUndefined();
  expect(marcoPorCodigo(filas, "ZB123 C2")).toBe(filas[1]);
});
