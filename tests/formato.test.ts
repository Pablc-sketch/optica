import { describe, expect, it } from "vitest";
import { formatearRut } from "../src/lib/rut";
import { formatearMonto, formatearTelefono, montoANumero } from "../src/lib/formato";
import { nombreCristal } from "../src/lib/cristales";

describe("formatearRut", () => {
  it("agrega puntos y guion a un RUT escrito de corrido", () => {
    expect(formatearRut("153487566")).toBe("15.348.756-6");
  });

  it("respeta el RUT que ya viene formateado", () => {
    expect(formatearRut("15.348.756-6")).toBe("15.348.756-6");
  });

  it("normaliza la k del dígito verificador a mayúscula", () => {
    expect(formatearRut("12345678k")).toBe("12.345.678-K");
  });

  it("va formateando a medida que se escribe, sin romperse", () => {
    expect(formatearRut("1")).toBe("1");
    expect(formatearRut("15")).toBe("1-5");
    expect(formatearRut("1534")).toBe("153-4");
  });

  it("devuelve vacío si no hay dato", () => {
    expect(formatearRut(null)).toBe("");
    expect(formatearRut("")).toBe("");
  });
});

describe("formatearTelefono", () => {
  it("arma el móvil chileno completo", () => {
    expect(formatearTelefono("912345678")).toBe("+56 9 1234 5678");
  });

  it("no duplica el 56 si ya venía incluido", () => {
    expect(formatearTelefono("56912345678")).toBe("+56 9 1234 5678");
    expect(formatearTelefono("+56 9 1234 5678")).toBe("+56 9 1234 5678");
  });

  it("ignora espacios y guiones escritos a mano", () => {
    expect(formatearTelefono("9 1234-5678")).toBe("+56 9 1234 5678");
  });

  it("formatea parcial mientras se escribe", () => {
    expect(formatearTelefono("9")).toBe("+56 9");
    expect(formatearTelefono("91234")).toBe("+56 9 1234");
  });

  it("devuelve vacío si no hay dato", () => {
    expect(formatearTelefono(null)).toBe("");
    expect(formatearTelefono("")).toBe("");
  });
});

describe("montos", () => {
  it("separa los miles con punto", () => {
    expect(formatearMonto("82000")).toBe("82.000");
    expect(formatearMonto(1250000)).toBe("1.250.000");
  });

  it("descarta lo que no sea dígito", () => {
    expect(formatearMonto("$ 82.000")).toBe("82.000");
  });

  it("vuelve a número lo que quedó escrito en el campo", () => {
    expect(montoANumero("82.000")).toBe(82000);
    expect(montoANumero("$1.250.000")).toBe(1250000);
    expect(montoANumero("")).toBe(0);
    expect(montoANumero(null)).toBe(0);
  });
});

describe("nombreCristal", () => {
  it("nombra el cristal con su tipo de lente adelante, sin repetirlo", () => {
    expect(nombreCristal("Monofocal", "Orgánico Antirreflejo")).toBe(
      "Monofocal Orgánico Antirreflejo"
    );
    expect(nombreCristal("Bifocal", "Bifocal Antirreflejo")).toBe("Bifocal Antirreflejo");
  });
});
