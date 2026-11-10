import { describe, expect, it } from "vitest";
import { leerFormularioOperativo, seCruzan, tramoOperativo } from "../src/lib/equipo";

const ID = "00000000-0000-4000-8000-000000000001";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const K1 = "00000000-0000-4000-8000-0000000000b1";

function formulario(campos: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of campos) f.append(k, v);
  return f;
}

describe("formulario de operativo", () => {
  it("jornada completa con personal y kit", () => {
    const r = leerFormularioOperativo(formulario([
      ["id", ID], ["nombre", " Plaza Norte "], ["fecha", "2030-03-10"], ["fecha_fin", "2030-03-11"], ["jornada", "completa"],
      ["hora_inicio", "09:00"], ["hora_fin", "13:00"], ["persona", P1], [`funcion_${P1}`, "tecnologo"], ["kit", K1],
    ]));
    expect(r).toMatchObject({ nombre: "Plaza Norte", fecha_fin: "2030-03-11", hora_inicio: null, hora_fin: null,
      personas: [{ id: P1, funcion: "tecnologo" }], kits: [K1] });
  });
  it("con horario exige ambas horas y en orden", () => {
    const base: [string, string][] = [["id", ID], ["nombre", "X"], ["fecha", "2030-03-10"], ["jornada", "horario"]];
    expect(leerFormularioOperativo(formulario([...base, ["hora_inicio", "09:00"], ["hora_fin", "13:00"]]))).toMatchObject({ hora_inicio: "09:00" });
    expect(leerFormularioOperativo(formulario([...base, ["hora_inicio", "15:00"], ["hora_fin", "13:00"]]))).toHaveProperty("error");
    expect(leerFormularioOperativo(formulario([...base, ["hora_inicio", "09:00"]]))).toHaveProperty("error");
  });
  it("rechaza fechas al revés, personas sin función e identificadores alterados", () => {
    expect(leerFormularioOperativo(formulario([["id", ID], ["nombre", "X"], ["fecha", "2030-03-10"], ["fecha_fin", "2030-03-01"]]))).toHaveProperty("error");
    expect(leerFormularioOperativo(formulario([["id", ID], ["nombre", "X"], ["fecha", "2030-03-10"], ["persona", P1]]))).toHaveProperty("error");
    expect(leerFormularioOperativo(formulario([["id", ID], ["nombre", "X"], ["fecha", "2030-03-10"], ["kit", "1 or 1=1"]]))).toHaveProperty("error");
    expect(leerFormularioOperativo(formulario([["id", "no-es-uuid"], ["nombre", "X"], ["fecha", "2030-03-10"]]))).toHaveProperty("error");
  });
});

describe("tramos y cruces (igual que en la base)", () => {
  const dia = (fecha: string, fin: string | null = null, hi: string | null = null, hf: string | null = null) =>
    tramoOperativo({ fecha, fecha_fin: fin, hora_inicio: hi, hora_fin: hf });
  it("días completos", () => {
    expect(dia("2030-03-10", "2030-03-11")).toEqual(["2030-03-10T00:00", "2030-03-12T00:00"]);
    expect(seCruzan(dia("2030-03-10", "2030-03-11"), dia("2030-03-11"))).toBe(true);
    expect(seCruzan(dia("2030-03-10"), dia("2030-03-11"))).toBe(false);
  });
  it("mañana y tarde no se cruzan; jornada completa sí", () => {
    const manana = dia("2030-05-05", null, "09:00", "13:00"), tarde = dia("2030-05-05", null, "14:00", "18:00");
    expect(seCruzan(manana, tarde)).toBe(false);
    expect(seCruzan(manana, dia("2030-05-05"))).toBe(true);
    expect(seCruzan(manana, dia("2030-05-05", null, "12:00", "15:00"))).toBe(true);
  });
});
