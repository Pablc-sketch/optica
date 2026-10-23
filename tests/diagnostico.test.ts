import { describe, expect, it } from "vitest";
import { diagnosticoDeReceta } from "../src/lib/diagnostico";

const base = { od_esfera: null, od_cilindro: null, od_add: null, oi_esfera: null, oi_cilindro: null, oi_add: null };

describe("diagnosticoDeReceta", () => {
  it("miopía en ambos ojos", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: -2, oi_esfera: -1.5 })).toBe("Miopía en ambos ojos");
  });
  it("hipermetropía y astigmatismo en ambos ojos", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: 1, od_cilindro: -0.5, oi_esfera: 2, oi_cilindro: -1 })).toBe(
      "Hipermetropía y astigmatismo en ambos ojos"
    );
  });
  it("cada ojo distinto", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: -3, od_cilindro: -1, oi_esfera: 1 })).toBe(
      "OD: miopía y astigmatismo · OI: hipermetropía"
    );
  });
  it("astigmatismo solo (esfera 0)", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: 0, od_cilindro: -1, oi_esfera: 0, oi_cilindro: -0.75 })).toBe(
      "Astigmatismo en ambos ojos"
    );
  });
  it("presbicia por adición", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: 1, oi_esfera: 1, od_add: 2, oi_add: 2 })).toBe(
      "Hipermetropía en ambos ojos · Presbicia"
    );
  });
  it("un ojo sin datos", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: -1 })).toBe("OD: miopía");
  });
  it("sin datos, nada", () => {
    expect(diagnosticoDeReceta(base)).toBeNull();
  });
  it("sin alteración cuando todo es 0", () => {
    expect(diagnosticoDeReceta({ ...base, od_esfera: 0, oi_esfera: 0 })).toBe("Sin alteración refractiva en ambos ojos");
  });
});
