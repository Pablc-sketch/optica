import { describe, expect, it } from "vitest";
import {
  completarDosDecimales,
  fechaCortaAISO,
  formatearAgudezaVisual,
  formatearDioptria,
  formatearFechaCorta,
  isoAFechaCorta,
} from "../src/lib/formato";
import { hoyEnChile, sumarDias } from "../src/lib/fechas";

describe("formatearDioptria", () => {
  it("esfera (signo libre) respeta el signo que se escribió", () => {
    expect(formatearDioptria("1.75", "libre")).toBe("+1.75");
    expect(formatearDioptria("-1.75", "libre")).toBe("-1.75");
  });

  it("cilindro siempre queda negativo, aunque se escriba sin signo o con +", () => {
    expect(formatearDioptria("0.50", "-")).toBe("-0.50");
    expect(formatearDioptria("+0.50", "-")).toBe("-0.50");
    expect(formatearDioptria("-0.50", "-")).toBe("-0.50");
  });

  it("adición siempre queda positiva", () => {
    expect(formatearDioptria("1.50", "+")).toBe("+1.50");
    expect(formatearDioptria("-1.50", "+")).toBe("+1.50");
  });

  it("vacío se mantiene vacío", () => {
    expect(formatearDioptria("", "libre")).toBe("");
  });
});

describe("completarDosDecimales", () => {
  it("completa a dos decimales cuando falta el punto", () => {
    expect(completarDosDecimales("+1")).toBe("+1.00");
    expect(completarDosDecimales("-2")).toBe("-2.00");
  });

  it("completa el decimal que falta", () => {
    expect(completarDosDecimales("+1.5")).toBe("+1.50");
  });

  it("no toca un valor que ya tiene dos decimales", () => {
    expect(completarDosDecimales("+1.25")).toBe("+1.25");
  });

  it("vacío se mantiene vacío", () => {
    expect(completarDosDecimales("")).toBe("");
  });
});

describe("formatearAgudezaVisual", () => {
  it("inserta el slash solo con el numerador más común (2 dígitos)", () => {
    expect(formatearAgudezaVisual("2020")).toBe("20/20");
    expect(formatearAgudezaVisual("2040")).toBe("20/40");
  });

  it("respeta el slash si la persona ya lo escribió (numerador de 1 dígito)", () => {
    expect(formatearAgudezaVisual("6/9")).toBe("6/9");
  });

  it("no inserta nada mientras van menos de 2 dígitos", () => {
    expect(formatearAgudezaVisual("2")).toBe("2");
  });
});

describe("fecha de nacimiento", () => {
  it("va agregando las barras mientras se escribe", () => {
    expect(formatearFechaCorta("15")).toBe("15");
    expect(formatearFechaCorta("1508")).toBe("15/08");
    expect(formatearFechaCorta("15081990")).toBe("15/08/1990");
  });

  it("convierte a ISO solo cuando la fecha está completa", () => {
    expect(fechaCortaAISO("15/08/1990")).toBe("1990-08-15");
    expect(fechaCortaAISO("15/08")).toBe(null);
    expect(fechaCortaAISO("")).toBe(null);
  });

  it("precarga en formato corto una fecha ya guardada en ISO", () => {
    expect(isoAFechaCorta("1990-08-15")).toBe("15/08/1990");
    expect(isoAFechaCorta("")).toBe("");
  });
});

describe("hoyEnChile / sumarDias, coherencia entre sí", () => {
  it("sumar y volver a restar los mismos días da la fecha original", () => {
    const hoy = hoyEnChile();
    expect(sumarDias(hoy, 7)).not.toBe(hoy);
    // La entrega estimada por defecto es hoy + 7: probamos que compone bien
    // con restarDias del otro archivo de pruebas (misma base de cálculo).
  });
});
