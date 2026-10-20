import { describe, expect, it } from "vitest";
import { montoAbono } from "../src/lib/monto-abono";

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
