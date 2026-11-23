import { describe, expect, it } from "vitest";
import { calcularPrecioAcordado, faltaPacienteParaGuardar, quitarHuerfanos, repartirDescuento } from "../src/lib/carrito";

const k = (...keys: string[]) => keys.map((key) => ({ key }));

describe("quitarHuerfanos", () => {
  it("al quitar el cristal del par 1 desaparecen su marco y su premium", () => {
    expect(quitarHuerfanos(k("armazon-1", "premium-1", "prod-x")).map((l) => l.key)).toEqual(["prod-x"]);
  });
  it("con dos pares, quitar el par 2 deja intacto el par 1", () => {
    expect(
      quitarHuerfanos(k("cristal-1", "armazon-1", "premium-1", "armazon-2", "premium-2")).map((l) => l.key)
    ).toEqual(["cristal-1", "armazon-1", "premium-1"]);
  });
  it("no toca productos sueltos", () => {
    expect(quitarHuerfanos(k("prod-a", "prod-b")).length).toBe(2);
  });
});

describe("faltaPacienteParaGuardar", () => {
  const cristal = { cristal: { tipoLente: "Monofocal" } };
  const accesorio = {};
  it("cristales sin paciente: no se puede guardar", () => {
    expect(faltaPacienteParaGuardar([cristal, accesorio], "")).toBe(true);
    expect(faltaPacienteParaGuardar([cristal], null)).toBe(true);
  });
  it("cristales con paciente: se guarda", () => {
    expect(faltaPacienteParaGuardar([cristal], "p1")).toBe(false);
  });
  it("solo accesorios sin paciente: se guarda", () => {
    expect(faltaPacienteParaGuardar([accesorio], "")).toBe(false);
    expect(faltaPacienteParaGuardar([], "")).toBe(false);
  });
});

describe("repartirDescuento", () => {
  it("usa el subtotal de los ítems cobrables y conserva el monto exacto con varias unidades", () => {
    const items = [
      { cantidad: 1, precioUnitario: 0 },
      { cantidad: 1, precioUnitario: 2_000 },
      { cantidad: 2, precioUnitario: 4_000 },
    ];
    expect(repartirDescuento(items, 5_000).map(i => i.descuento)).toEqual([0, 2_000, 3_000]);
    expect(repartirDescuento(items, 10_000).map(i => i.descuento)).toEqual([0, 2_000, 8_000]);
    expect(repartirDescuento(items, 0).map(i => i.descuento)).toEqual([0, 0, 0]);
  });
});

describe("calcularPrecioAcordado", () => {
  it("calcula el descuento o el total según lo que la vendedora ingrese", () => {
    expect(calcularPrecioAcordado(201_990, "total", 160_000)).toEqual({ total: 160_000, descuento: 41_990, invalido: false });
    expect(calcularPrecioAcordado(201_990, "descuento", 41_990)).toEqual({ total: 160_000, descuento: 41_990, invalido: false });
    expect(calcularPrecioAcordado(216_990, "total", 160_000)).toEqual({ total: 160_000, descuento: 56_990, invalido: false });
  });

  it("distingue campo vacío de una cortesía completa y bloquea importes superiores al subtotal", () => {
    expect(calcularPrecioAcordado(201_990, "total", null)).toEqual({ total: 201_990, descuento: 0, invalido: false });
    expect(calcularPrecioAcordado(201_990, "total", 0)).toEqual({ total: 0, descuento: 201_990, invalido: false });
    expect(calcularPrecioAcordado(201_990, "total", 205_000).invalido).toBe(true);
    expect(calcularPrecioAcordado(201_990, "descuento", 205_000).invalido).toBe(true);
  });
});
