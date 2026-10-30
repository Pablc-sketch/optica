import { describe, expect, it } from "vitest";
import { hayQueRefrescar, HORAS_INACTIVIDAD, leerActividad, sesionVencida } from "../src/lib/sesion-actividad";

const H = 3600_000;
const AHORA = 1_800_000_000_000;

describe("sesión por inactividad", () => {
  it("dentro del plazo sigue abierta", () => {
    expect(sesionVencida(AHORA - 2 * H, AHORA)).toBe(false);
    expect(sesionVencida(AHORA - HORAS_INACTIVIDAD * H, AHORA)).toBe(false);
  });
  it("pasado el plazo se vence", () => {
    expect(sesionVencida(AHORA - (HORAS_INACTIVIDAD * H + 1), AHORA)).toBe(true);
    expect(sesionVencida(AHORA - 30 * H, AHORA)).toBe(true);
  });
  it("sin marca no se vence (se marcará desde ahora)", () => {
    expect(sesionVencida(null, AHORA)).toBe(false);
  });
  it("una marca del futuro se considera alterada", () => {
    expect(sesionVencida(AHORA + 5 * H, AHORA)).toBe(true);
  });
  it("lee solo números válidos", () => {
    expect(leerActividad("1800000000000")).toBe(1_800_000_000_000);
    expect(leerActividad("abc")).toBeNull();
    expect(leerActividad("")).toBeNull();
    expect(leerActividad(undefined)).toBeNull();
  });
  it("refresca la marca cada 5 minutos, no en cada clic", () => {
    expect(hayQueRefrescar(AHORA - 60_000, AHORA)).toBe(false);
    expect(hayQueRefrescar(AHORA - 6 * 60_000, AHORA)).toBe(true);
    expect(hayQueRefrescar(null, AHORA)).toBe(true);
  });
});
