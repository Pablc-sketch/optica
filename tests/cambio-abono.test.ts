import { describe, expect, it } from "vitest";
import { estadoPago, validarCambioAbono } from "../src/lib/cambio-abono";

describe("cambiar un abono", () => {
  it("acepta corregir el monto dentro del total", () => {
    expect(validarCambioAbono({ monto: 24000, medio: "debito", totalVenta: 48000, otrosAbonos: 24000 })).toEqual({ ok: true, monto: 24000, medio: "debito" });
  });
  it("no deja pasar del total con los otros abonos", () => {
    const r = validarCambioAbono({ monto: 30000, medio: "efectivo", totalVenta: 48000, otrosAbonos: 24000 });
    expect(r.ok).toBe(false);
  });
  it("no acepta $0, negativos ni decimales", () => {
    for (const monto of [0, -5000, 1000.5]) {
      expect(validarCambioAbono({ monto, medio: "efectivo", totalVenta: 48000, otrosAbonos: 0 }).ok).toBe(false);
    }
  });
  it("exige un medio válido", () => {
    expect(validarCambioAbono({ monto: 1000, medio: "", totalVenta: 48000, otrosAbonos: 0 }).ok).toBe(false);
    expect(validarCambioAbono({ monto: 1000, medio: "bitcoin", totalVenta: 48000, otrosAbonos: 0 }).ok).toBe(false);
  });
  it("recalcula el estado de pago", () => {
    expect(estadoPago(48000, 48000)).toBe("pagada");
    expect(estadoPago(48000, 20000)).toBe("abono_parcial");
    expect(estadoPago(48000, 0)).toBe("pendiente");
  });
});
