import { describe, expect, it } from "vitest";
import { estadoDisponibilidad, eventosDelDia, filtroAgenda, resumenAgenda, type EventoAgenda } from "@/lib/agenda";

const evento = (id: string, cambios: Partial<EventoAgenda> = {}): EventoAgenda => ({
  id, tipo: "propio", nombre: id, optica: "Óptica Global", fecha: "2026-11-17", fecha_fin: null,
  hora_inicio: "09:00:00", hora_fin: "11:00:00", direccion: "Quilicura", notas: null, estado: "confirmado", ...cambios,
});

describe("resumen del calendario", () => {
  it("muestra tres sedes del día ordenadas por hora y deja los horarios pendientes al final", () => {
    const eventos = [evento("tarde", { hora_inicio: "16:00" }), evento("pendiente", { hora_inicio: null, hora_fin: null }), evento("mañana"), evento("medio", { hora_inicio: "12:00" })];
    expect(eventosDelDia(eventos, "2026-11-17").map(e => e.id)).toEqual(["mañana", "medio", "tarde", "pendiente"]);
    expect(eventos.map(e => e.id)).toEqual(["tarde", "pendiente", "mañana", "medio"]);
  });

  it("filtra ambas vistas, excluye cancelados y conserva la ocupación real con externos ocultos", () => {
    const eventos = [evento("propio"), evento("externo", { tipo: "externo", hora_inicio: null, hora_fin: null }), evento("cancelado", { estado: "cancelado" })];
    expect(eventosDelDia(eventos, "2026-11-17", "propio").map(e => e.id)).toEqual(["propio"]);
    expect(eventosDelDia(eventos, "2026-11-17", "externo").map(e => e.id)).toEqual(["externo"]);
    expect(eventosDelDia(eventos, "2026-11-17", "todos")).toHaveLength(2);
    expect(estadoDisponibilidad("2026-11-17", [], eventos)).toBe("ocupado");
  });

  it("repite un operativo de varios días en cada fecha, recorta al mes y cuenta cada sede", () => {
    const eventos = [evento("rango", { fecha: "2026-10-30", fecha_fin: "2026-11-02" }), evento("otra sede", { fecha: "2026-11-02" }), evento("fuera", { fecha: "2026-12-01" })];
    const dias = resumenAgenda(eventos, "2026-11-01", "2026-11-30");
    expect(dias.map(d => [d.fecha, d.eventos.length])).toEqual([["2026-11-01", 1], ["2026-11-02", 2]]);
    expect(new Set(dias.flatMap(d => d.eventos.map(e => e.id))).size).toBe(2);
  });

  it("admite meses vacíos y normaliza filtros desconocidos", () => {
    expect(resumenAgenda([], "2026-11-01", "2026-11-30", "propio")).toEqual([]);
    expect(filtroAgenda("desconocido")).toBe("todos");
    expect(filtroAgenda("externo")).toBe("externo");
  });
});
