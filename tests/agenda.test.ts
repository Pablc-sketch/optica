import { describe, expect, it } from "vitest";
import { buscarCruce, estadoDisponibilidad, fechasAgendaValidas, horarioAgendaValido, rangosDisponibles, type EventoAgenda } from "@/lib/agenda";

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


describe("disponibilidad visible del tecnólogo", () => {
  it("no ofrece como libre un día sin confirmar aunque no tenga operativos", () => {
    expect(estadoDisponibilidad("2026-11-18", [bloque], [])).toBe("sin_confirmar");
  });
  it("un operativo por confirmar también ocupa un día declarado disponible", () => {
    expect(estadoDisponibilidad("2026-11-12", [bloque], [{ ...externo, estado: "pendiente" }])).toBe("ocupado");
  });
  it("una cancelación devuelve la disponibilidad solo si fue declarada", () => {
    const eventos = [{ ...externo, estado: "cancelado" as const }];
    expect(estadoDisponibilidad("2026-11-12", [bloque], eventos)).toBe("disponible");
    expect(estadoDisponibilidad("2026-11-12", [], eventos)).toBe("sin_confirmar");
  });
  it("conserva ocupados todos los días de un rango que cruza de mes", () => {
    const eventos = [{ ...externo, fecha: "2026-10-30", fecha_fin: "2026-11-02" }];
    expect(estadoDisponibilidad("2026-11-01", [], eventos)).toBe("ocupado");
    expect(estadoDisponibilidad("2026-11-02", [], eventos)).toBe("ocupado");
    expect(estadoDisponibilidad("2026-11-03", [], eventos)).toBe("sin_confirmar");
  });
});


describe("distingue mi óptica de los compromisos externos", () => {
  const propio: EventoAgenda = { ...externo, id: "global", tipo: "propio", optica: "Óptica Global" };
  it("identifica los días de Óptica Global aunque haya disponibilidad declarada", () => {
    expect(estadoDisponibilidad("2026-11-12", [bloque], [propio])).toBe("propio");
  });
  it("un cruce externo conserva la advertencia de ocupado en cualquier orden", () => {
    expect(estadoDisponibilidad("2026-11-12", [bloque], [propio, externo])).toBe("ocupado");
    expect(estadoDisponibilidad("2026-11-12", [bloque], [externo, propio])).toBe("ocupado");
  });
  it("un operativo propio cancelado no impide mostrar un día libre", () => {
    expect(estadoDisponibilidad("2026-11-12", [bloque], [{ ...propio, estado: "cancelado" }])).toBe("disponible");
  });
});
