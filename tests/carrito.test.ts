import { describe, expect, it } from "vitest";
import { faltaPacienteParaGuardar, quitarHuerfanos } from "../src/lib/carrito";

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
