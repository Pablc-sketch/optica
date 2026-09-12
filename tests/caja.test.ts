import { describe, expect, it } from "vitest";
import { cajaDelPago, calcularCaja, resumirCaja } from "../src/lib/caja";

describe("de qué caja es cada movimiento", () => {
  it("solo el efectivo queda en la mano", () => {
    expect(cajaDelPago("efectivo")).toBe("efectivo");
    expect(cajaDelPago("debito")).toBe("digital");
    expect(cajaDelPago("credito")).toBe("digital");
    expect(cajaDelPago("transferencia")).toBe("digital");
  });

  it("un pago sin medio anotado se cuenta como efectivo", () => {
    expect(cajaDelPago(null)).toBe("efectivo");
    expect(cajaDelPago("")).toBe("efectivo");
  });
});

describe("caja global", () => {
  it("separa lo que hay en la mano de lo que hay en la cuenta", () => {
    const caja = calcularCaja({
      entradas: [
        { monto: 56_000, medio_pago: "efectivo" },
        { monto: 24_000, medio_pago: "efectivo" },
        { monto: 100_000, medio_pago: "debito" },
        { monto: 38_000, medio_pago: "transferencia" },
      ],
      salidas: [],
    });
    expect(caja.hayEfectivo).toBe(80_000);
    expect(caja.hayDigital).toBe(138_000);
    expect(caja.total).toBe(218_000);
  });

  it("un retiro baja solo la caja de la que salió", () => {
    const caja = calcularCaja({
      entradas: [
        { monto: 100_000, medio_pago: "efectivo" },
        { monto: 100_000, medio_pago: "debito" },
      ],
      salidas: [
        { monto: 20_000, caja: "efectivo" },
        { monto: 40_000, caja: "digital" },
      ],
    });
    expect(caja.hayEfectivo).toBe(80_000);
    expect(caja.hayDigital).toBe(60_000);
  });

  it("un aporte (monto negativo) sube la caja en vez de bajarla", () => {
    const caja = calcularCaja({
      entradas: [{ monto: 50_000, medio_pago: "efectivo" }],
      salidas: [{ monto: -30_000, caja: "efectivo" }],
    });
    expect(caja.hayEfectivo).toBe(80_000);
  });

  it("los gastos del operativo salen de la cuenta, nunca del efectivo", () => {
    const caja = calcularCaja({
      entradas: [
        { monto: 50_000, medio_pago: "efectivo" },
        { monto: 200_000, medio_pago: "debito" },
      ],
      salidas: [],
      salidaDigitalExtra: 108_000,
    });
    expect(caja.hayEfectivo).toBe(50_000);
    expect(caja.hayDigital).toBe(92_000);
  });

  it("la comisión de la máquina solo descuenta de la cuenta, y por tasa separada", () => {
    const caja = calcularCaja({
      entradas: [
        { monto: 100_000, medio_pago: "efectivo" },
        { monto: 100_000, medio_pago: "debito" },
        { monto: 48_000, medio_pago: "credito" },
      ],
      salidas: [],
      comisionDebitoPct: 0,
      comisionCreditoPct: 2,
    });
    expect(caja.comisionTarjeta).toBe(960);
    expect(caja.hayEfectivo).toBe(100_000);
    expect(caja.hayDigital).toBe(148_000 - 960);
  });

  it("sin movimientos no inventa plata", () => {
    const caja = calcularCaja({ entradas: [], salidas: [] });
    expect(caja.total).toBe(0);
    expect(caja.comisionTarjeta).toBe(0);
  });

  it("la caja puede quedar negativa si se sacó más de lo que entró, en vez de mostrar cero", () => {
    // Un negativo acá es una señal de que algo se anotó mal; taparlo con
    // Math.max(0, ...) escondería justo el error que hay que ver.
    const caja = calcularCaja({
      entradas: [{ monto: 10_000, medio_pago: "efectivo" }],
      salidas: [{ monto: 30_000, caja: "efectivo" }],
    });
    expect(caja.hayEfectivo).toBe(-20_000);
  });
});

describe("resumirCaja sobre totales ya sumados (los que trae la base)", () => {
  it("da el mismo resultado que sumar los movimientos uno por uno", () => {
    const movimientos = calcularCaja({
      entradas: [
        { monto: 256_736, medio_pago: "efectivo" },
        { monto: 555_000, medio_pago: "debito" },
        { monto: 48_000, medio_pago: "credito" },
        { monto: 48_000, medio_pago: "transferencia" },
      ],
      salidas: [
        { monto: 20_000, caja: "efectivo" },
        { monto: 40_000, caja: "digital" },
        { monto: 77_945, caja: "digital" },
      ],
      salidaDigitalExtra: 108_000,
      comisionDebitoPct: 0,
      comisionCreditoPct: 2,
    });
    const totales = resumirCaja(
      {
        entroEfectivo: 256_736,
        entroDigital: 651_000,
        entroDebito: 555_000,
        entroCredito: 48_000,
        salioEfectivo: 20_000,
        salioDigital: 117_945 + 108_000,
      },
      { comisionDebitoPct: 0, comisionCreditoPct: 2 }
    );
    expect(totales).toEqual(movimientos);
    // Los números reales del negocio al 12/09/2026, para que si algún día
    // cambia la fórmula esto lo avise en vez de pasar callado.
    expect(totales.hayEfectivo).toBe(236_736);
    expect(totales.comisionTarjeta).toBe(960);
    expect(totales.hayDigital).toBe(424_095);
    expect(totales.total).toBe(660_831);
  });
});
