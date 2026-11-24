import { describe, expect, it } from "vitest";
import { montoAbono, montosSugeridosAbono } from "../src/lib/monto-abono";

// La UI muestra `monto` en el botón y envía ese mismo `monto` como
// abonoInicial: probar la función es probar que los dos coinciden.
describe("montoAbono", () => {
  it("vacío = paga todo", () => {
    expect(montoAbono("", 48000)).toEqual({ monto: 48000, tipo: "total" });
    expect(montoAbono("   ", 48000)).toEqual({ monto: 48000, tipo: "total" });
  });
  it("0 explícito = sin abono", () => {
    expect(montoAbono("0", 48000)).toEqual({ monto: 0, tipo: "sin_abono" });
  });
  it("parcial", () => {
    expect(montoAbono("24.000", 48000)).toEqual({ monto: 24000, tipo: "parcial" });
  });
  it("igual al total", () => {
    expect(montoAbono("48.000", 48000)).toEqual({ monto: 48000, tipo: "total" });
  });
  it("superior al total se acota al total", () => {
    expect(montoAbono("90.000", 48000)).toEqual({ monto: 48000, tipo: "total" });
  });
  it("cortesía (total 0) nunca cobra", () => {
    expect(montoAbono("", 0)).toEqual({ monto: 0, tipo: "sin_abono" });
    expect(montoAbono("5.000", 0)).toEqual({ monto: 0, tipo: "sin_abono" });
  });
});

describe("montosSugeridosAbono", () => {
  it("recalcula la mitad sobre el total acordado y el mínimo según el cobro", () => {
    expect(montosSugeridosAbono(49990, 10000)).toEqual({ total: 49990, mitad: 24995, minimo: 10000 });
    expect(montosSugeridosAbono(45001, 11000)).toEqual({ total: 45001, mitad: 22501, minimo: 11000 });
  });

  it("mantiene el total cuando desaparece la opción de abono mínimo", () => {
    expect(montosSugeridosAbono(5000, 0).minimo).toBe(5000);
    expect(montosSugeridosAbono(5000, 10000).minimo).toBe(5000);
    expect(montosSugeridosAbono(0, 0)).toEqual({ total: 0, mitad: 0, minimo: 0 });
  });
});
