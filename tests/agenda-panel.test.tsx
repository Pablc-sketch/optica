import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { EventoAgenda } from "@/lib/agenda";
const mocks = vi.hoisted(() => ({ perfil: vi.fn(), agenda: vi.fn(), crearCliente: vi.fn() }));
vi.mock("@/lib/fechas", async importar => ({
  ...await importar<typeof import("@/lib/fechas")>(),
  hoyEnChile: () => "2026-11-17",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.crearCliente }));
vi.mock("@/lib/resumen-pendientes", () => ({
  cargarPendientes: async () => ({
    resumen: { operativos: [{ operativoId: "realizado", total: 25000, ahorro: 0 }] }, error: null,
  }),
}));
vi.mock("@/lib/autorizacion", () => ({ exigirRolPagina: mocks.perfil }));
vi.mock("@/lib/agenda-servidor", () => ({ cargarAgenda: mocks.agenda }));
vi.mock("@/lib/actions/agenda", () => ({ borrarDisponibilidad: vi.fn() }));
vi.mock("../src/app/(app)/(protegido)/operativos/agenda/formulario", () => ({ default: () => <p>Formulario</p> }));
import Agenda from "../src/app/(app)/(protegido)/operativos/agenda/page";
import Operativos from "../src/app/(app)/(protegido)/operativos/page";
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
const html = async (filtro: string, ver?: string) => renderToStaticMarkup(await Agenda({ searchParams: Promise.resolve({ mes: "2026-11", dia: "2026-11-17", filtro, ver }) }));
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
  it("oculta los realizados en la agenda activa y permite encontrarlos en el archivo", async () => {
    mocks.agenda.mockResolvedValue({
      nombreOptica: "Óptica Global", disponibilidad: [], error: null, eventos: [
        evento("Sede por realizar"),
        evento("Sede finalizada", { estado: "realizado" }),
        evento("Sede suspendida", { estado: "cancelado" }),
        evento("Viaje anterior", { tipo: "externo", fecha: "2026-11-15" }),
      ],
    });
    const activa = await html("todos");
    expect(activa).toContain("Sede por realizar");
    expect(activa).toContain("Marcar realizado");
    expect(activa).not.toContain("Sede finalizada");
    expect(activa).not.toContain("Sede suspendida");
    expect(activa).not.toContain("Viaje anterior");
    const archivo = await html("todos", "archivo");
    expect(archivo).toContain("Sede finalizada");
    expect(archivo).toContain("Sede suspendida");
    expect(archivo).toContain("Viaje anterior");
    expect(archivo).not.toContain("Sede por realizar");
    expect(archivo).not.toContain("Agendar este día");
    expect(archivo).toContain('<details class="mt-2"><summary');
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


describe("lista de operativos", () => {
  it("archiva los realizados aun si quedan pagos y entregas", async () => {
    const sedes = [
      { id: "activo", nombre: "Sede vigente", estado: "planificado" },
      { id: "realizado", nombre: "Sede terminada", estado: "realizado" },
      { id: "cancelado", nombre: "Sede cancelada", estado: "cancelado" },
    ].map(sede => ({ ...sede, fecha: "2026-11-17", fecha_fin: null }));
    mocks.crearCliente.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "admin" } } }) },
      from: (tabla: string) => {
        let datos: unknown = tabla === "operativos" ? sedes : tabla === "users"
          ? { rol: "admin", tenant_id: "ejemplo" } : tabla === "ventas"
            ? [{ operativo_id: "realizado", total: 40000, pagos_abonos: [], venta_items: [{ ordenes_trabajo: { id: "ot1", estado: "listo" } }] }]
            : [];
        const consulta = {
          select: () => consulta, order: () => consulta, range: () => consulta,
          eq: () => consulta, not: () => consulta, single: () => consulta,
          in: (_columna: string, estados: string[]) => {
            datos = sedes.filter(sede => estados.includes(sede.estado));
            return consulta;
          },
          then: (resolver: (resultado: unknown) => unknown) => Promise.resolve({ data: datos, error: null }).then(resolver),
        };
        return consulta;
      },
    });
    const ver = async (vista?: string) => renderToStaticMarkup(await Operativos({ searchParams: Promise.resolve({ ver: vista }) }));
    const activos = await ver();
    expect(activos).toContain("Sede vigente");
    expect(activos).not.toContain("Sede terminada");
    expect(activos).not.toContain("Sede cancelada");
    const archivo = await ver("archivo");
    expect(archivo).toContain("Sede terminada");
    expect(archivo).toContain("1 orden por entregar");
    expect(archivo).toContain("25.000");
    expect(archivo).toContain("Sede cancelada");
    expect(archivo).not.toContain("Sede vigente");
  });
});
