import { describe, expect, it } from "vitest";
import { buscarCruce, horariosLibres, rangoAgendaValido, type EventoAgenda } from "@/lib/agenda";

const fecha = "2026-11-11";
const bloque = { id: "libre", fecha, hora_inicio: "09:00:00", hora_fin: "18:00:00" };
const externo: EventoAgenda = {
  id: "externo", tipo: "externo", estado: "confirmado", fecha: "2026-11-10", fecha_fin: "2026-11-14",
  hora_inicio: "11:00:00", hora_fin: "13:00:00", nombre: "Otra óptica", optica: "Ejemplo", direccion: null, notas: null,
};

describe("agenda compartida", () => {
  it("conserva los tramos libres antes y después de un compromiso que ocupa varios días", () => {
    expect(horariosLibres([bloque], [externo], fecha).map(b => [b.hora_inicio, b.hora_fin]))
      .toEqual([["09:00", "11:00"], ["13:00", "18:00"]]);
  });

  it("permite horarios contiguos y detecta cruces en un día intermedio", () => {
    expect(buscarCruce({ ...bloque, fecha_fin: null, hora_inicio: "13:00", hora_fin: "15:00" }, [externo])).toBeUndefined();
    expect(buscarCruce({ ...bloque, fecha_fin: null, hora_inicio: "12:59", hora_fin: "15:00" }, [externo])).toBe(externo);
  });

  it("ignora cancelaciones y trata los operativos sin horario como bloqueos conservadores", () => {
    expect(horariosLibres([bloque], [{ ...externo, estado: "cancelado" }], fecha)).toHaveLength(1);
    expect(horariosLibres([bloque], [{ ...externo, hora_inicio: null }], fecha)).toEqual([]);
  });

  it("omite los bloques de hoy cuyo horario ya terminó", () => {
    expect(horariosLibres([bloque], [], fecha, "18:00")).toEqual([]);
  });

  it("rechaza fechas inexistentes y horarios invertidos", () => {
    expect(rangoAgendaValido("2026-02-30", "2026-03-02", "09:00", "10:00")).toBe(false);
    expect(rangoAgendaValido(fecha, fecha, "18:00", "09:00")).toBe(false);
  });
});
