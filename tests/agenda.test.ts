import { describe, expect, it } from "vitest";
import { buscarCruce, fechasAgendaValidas, horarioAgendaValido, rangosDisponibles, type EventoAgenda } from "@/lib/agenda";

const bloque = { id: "libre", fecha: "2026-11-09", fecha_fin: "2026-11-17" };
const externo: EventoAgenda = {
  id: "externo", tipo: "externo", estado: "confirmado", fecha: "2026-11-10", fecha_fin: "2026-11-14",
  hora_inicio: "11:00:00", hora_fin: "13:00:00", nombre: "Otra óptica", optica: "Ejemplo", direccion: null, notas: null,
};

describe("agenda compartida", () => {
  it("descuenta días completos de la disponibilidad y conserva los rangos restantes", () => {
    expect(rangosDisponibles([bloque], [externo], bloque.fecha, bloque.fecha_fin)).toEqual([
      { fecha: "2026-11-09", fecha_fin: null },
      { fecha: "2026-11-15", fecha_fin: "2026-11-17" },
    ]);
  });

  it("bloquea cualquier hora del operativo externo aunque el registro antiguo tenga horas", () => {
    expect(buscarCruce({ ...externo, fecha: "2026-11-11", fecha_fin: null, hora_inicio: "15:00", hora_fin: "16:00" }, [externo])).toBe(externo);
  });

  it("permite horarios contiguos entre operativos propios y detecta un cruce con un externo sin horas", () => {
    const propio: EventoAgenda = { ...externo, id: "propio", tipo: "propio" };
    const nuevo = { fecha: "2026-11-11", fecha_fin: null, hora_inicio: "13:00", hora_fin: "15:00" };
    expect(buscarCruce(nuevo, [propio])).toBeUndefined();
    expect(buscarCruce({ ...nuevo, hora_inicio: null, hora_fin: null }, [propio])).toBe(propio);
  });

  it("omite cancelaciones, recorta rangos al mes visible y admite un rango de un solo día", () => {
    expect(rangosDisponibles([bloque], [{ ...externo, estado: "cancelado" }], "2026-11-12", "2026-11-16"))
      .toEqual([{ fecha: "2026-11-12", fecha_fin: "2026-11-16" }]);
    expect(fechasAgendaValidas(bloque.fecha, bloque.fecha)).toBe(true);
  });

  it("rechaza fechas inexistentes y horarios invertidos", () => {
    expect(fechasAgendaValidas("2026-02-30", "2026-03-02")).toBe(false);
    expect(horarioAgendaValido("18:00", "09:00")).toBe(false);
  });
});
