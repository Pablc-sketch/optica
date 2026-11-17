import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventoAgenda } from "@/lib/agenda";
const mocks = vi.hoisted(() => ({ perfil: vi.fn(), agenda: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({ exigirRolPagina: mocks.perfil }));
vi.mock("@/lib/agenda-servidor", () => ({ cargarAgenda: mocks.agenda }));
vi.mock("@/lib/actions/agenda", () => ({ borrarDisponibilidad: vi.fn() }));
vi.mock("../src/app/(app)/(protegido)/operativos/agenda/formulario", () => ({ default: () => <p>Formulario</p> }));
import Agenda from "../src/app/(app)/(protegido)/operativos/agenda/page";
const evento = (id: string, cambios: Partial<EventoAgenda> = {}): EventoAgenda => ({
  id, tipo: "propio", nombre: id, optica: "Óptica Global", fecha: "2026-11-17", fecha_fin: null,
  hora_inicio: "09:00", hora_fin: "11:00", direccion: "Quilicura", notas: null, estado: "confirmado", ...cambios,
});
beforeEach(() => {
  mocks.perfil.mockResolvedValue({ tenantId: "ejemplo", rol: "admin", supabase: {} });
  mocks.agenda.mockResolvedValue({ nombreOptica: "Óptica Global", disponibilidad: [], error: null, eventos: [
    evento("Sede tarde", { hora_inicio: "16:00", hora_fin: "18:00", direccion: "Renca" }),
    evento("Sede mañana"), evento("Sede mediodía", { hora_inicio: "12:00", hora_fin: "14:00", direccion: "Conchalí" }),
    evento("Viaje externo", { tipo: "externo", optica: "Óptima Visión", hora_inicio: null, hora_fin: null }),
  ] });
});
const html = async (filtro: string) => renderToStaticMarkup(await Agenda({ searchParams: Promise.resolve({ mes: "2026-11", dia: "2026-11-17", filtro }) }));
describe("pantalla de calendario", () => {
  it("permite a una vendedora ver y editar las sedes y abrir su ruta", async () => {
    mocks.perfil.mockResolvedValue({ tenantId: "ejemplo", rol: "ventas", supabase: {} });
    const s = await html("propio");
    expect(mocks.perfil).toHaveBeenCalledWith(["admin", "ventas"]);
    expect(s).toContain("Editar");
    expect(s).toContain("Ruta del día");
    expect(s).toContain("Cómo llegar");
    expect(s).not.toContain("Metas y resultados del mes");
  });
  it("muestra tres sedes dentro del día y un resumen propio en orden de horario", async () => {
    const s = await html("propio");
    expect(s).toContain("Resumen · Óptica Global");
    expect(s).toContain("3 operativos · 1 día con atención");
    expect(s).not.toContain("Viaje externo");
    expect(s).toContain("+1 en otras ópticas");
    const resumen = s.slice(s.indexOf('id="resumen-2026-11-17"'));
    expect(resumen.indexOf("Sede mañana")).toBeLessThan(resumen.indexOf("Sede mediodía"));
    expect(resumen.indexOf("Sede mediodía")).toBeLessThan(resumen.indexOf("Sede tarde"));
    expect(s).toContain("filtro=propio#detalle-dia");
    expect(s).toContain("mes=2026-12&amp;dia=2026-12-01&amp;filtro=propio");
  });
  it("cambia también el resumen al seleccionar externos o todos", async () => {
    const externos = await html("externo");
    expect(externos).toContain("Viaje externo");
    expect(externos).not.toContain("Sede mañana");
    expect(externos).toContain("Resumen · Otras ópticas");
    const todos = await html("todos");
    expect(todos).toContain("4 operativos · 1 día con atención");
    expect(todos).toContain("Viaje externo");
    expect(todos).toContain("Sede mañana");
  });
});
