import { describe, expect, it, vi } from "vitest";
import { prepararMensajeIA, mensajeBasico } from "../src/lib/mensaje-optica-ia";
const mocks = vi.hoisted(() => ({ perfil: vi.fn(), generar: vi.fn(), from: vi.fn() }));
vi.mock("ai", () => ({ generateText: mocks.generar }));
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil: mocks.perfil, SinPermiso: class extends Error {} }));
import { generarMensajeOperativo } from "../src/lib/actions/mensaje-optica-ia";
const contexto = { optica: "Óptica Global", operativo: "Escuela", lugar: "Sede central", fecha: "30/10/2026", horario: "10:00 a 13:00" };
describe("mensajes de óptica", () => {
  it("usa el contexto y conserva las instrucciones como datos", () => {
    const r = prepararMensajeIA(contexto, "Avisar llegada");
    expect(JSON.parse(r.prompt)).toEqual({ contexto, pedido: "Avisar llegada" });
    expect(r.system).toContain("No inventes");
    expect(r.system).toContain("{nombre}");
  });
  it("valida solicitudes vacías o excesivas", () => {
    expect(() => prepararMensajeIA(contexto, " ")).toThrow();
    expect(() => prepararMensajeIA(contexto, "a".repeat(1501))).toThrow();
  });
  it("la plantilla sin IA no inventa datos faltantes ni afirma lentes listos", () => {
    const t = mensajeBasico({ ...contexto, fecha: null, horario: null });
    expect(t).toContain("[horario por confirmar]");
    expect(t).not.toContain("todos los lentes");
  });
  it("rechaza un operativo inaccesible antes de llamar a la IA", async () => {
    const builder = { select: () => builder, eq: () => builder, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: { nombre_comercial: "Óptica" }, error: null }) };
    mocks.from.mockReturnValue(builder);
    mocks.perfil.mockResolvedValue({ supabase: { from: mocks.from }, tenantId: "tenant-a", user: { id: "user-a" } });
    const r = await generarMensajeOperativo({ operativoId: "11111111-1111-4111-a111-111111111111", instrucciones: "Avisar llegada" });
    expect(r.error).toBeTruthy();
    expect(mocks.generar).not.toHaveBeenCalled();
    expect(mocks.perfil).toHaveBeenCalledWith({ roles: ["admin"], suscripcion: true });
  });
});
