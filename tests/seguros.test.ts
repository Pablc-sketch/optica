import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepararBusquedaSeguro } from "../src/lib/seguros-busqueda";

const { requerirPerfil, from, query } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "ilike", "order"]) query[metodo] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn(() => query);
  return { requerirPerfil: vi.fn(), from, query };
});
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil, SinPermiso: class SinPermiso extends Error {} }));
import { buscarDocumentosSeguro } from "../src/lib/actions/seguros";
import { SinPermiso } from "../src/lib/autorizacion";

beforeEach(() => {
  vi.clearAllMocks();
  requerirPerfil.mockResolvedValue({ supabase: { from }, tenantId: "optica-prueba" });
  query.limit.mockResolvedValue({ data: [], error: null });
});

describe("búsqueda de documentos", () => {
  it("acepta RUT con y sin formato y K", () => {
    expect(prepararBusquedaSeguro("12.345.678-k")).toEqual(prepararBusquedaSeguro("12345678K"));
    expect(prepararBusquedaSeguro("12345678K")?.patrones).toContain("12.345.678-K");
  });
  it("conserva nombres compuestos y tildes", () => {
    expect(prepararBusquedaSeguro("  María   José O'Neill ")).toEqual({ campo: "nombre", patrones: ["%María José O'Neill%"] });
  });
  it.each(["", "ab", "123", "%", "___", "nombre,or(id.neq.null)", "*ab*", null, {}, "a".repeat(81)])("rechaza búsquedas amplias o sintaxis de filtro: %s", (texto) => {
    expect(prepararBusquedaSeguro(texto)).toBeNull();
  });
  it("vuelve a comprobar rol y suscripción en cada solicitud", async () => {
    requerirPerfil.mockRejectedValueOnce(new SinPermiso("Sin acceso"));
    expect(await buscarDocumentosSeguro("Paciente" )).toEqual({ compras: [], error: "Sin acceso" });
    expect(requerirPerfil).toHaveBeenCalledWith({ roles: ["admin", "ventas"], suscripcion: true });
    expect(from).not.toHaveBeenCalled();
  });
  it("no consulta pacientes con una búsqueda vacía", async () => {
    await buscarDocumentosSeguro("");
    expect(from).not.toHaveBeenCalled();
  });
  it("restringe por óptica, excluye anulaciones y limita filas", async () => {
    await buscarDocumentosSeguro("Paciente");
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "optica-prueba");
    expect(query.eq).toHaveBeenCalledWith("anulada", false);
    expect(query.ilike).toHaveBeenCalledWith("pacientes.nombre", "%Paciente%");
    expect(query.limit).toHaveBeenCalledWith(21);
  });
  it("no devuelve resultados parciales si falla una consulta", async () => {
    query.limit.mockResolvedValueOnce({ data: [], error: { message: "detalle privado" } });
    const resultado = await buscarDocumentosSeguro("Paciente");
    expect(resultado.compras).toEqual([]);
    expect(resultado.error).toBeDefined();
    expect(resultado.error).not.toContain("detalle privado");
  });
  it("deduplica variantes del RUT, suma abonos y no devuelve campos extra", async () => {
    query.limit.mockResolvedValue({ error: null, data: [{ id: "venta-ficticia", fecha: "2026-10-01", total: 100, pacientes: [{ nombre: "Paciente ficticio", rut: "12345678K" }], pagos_abonos: [{ monto: 40 }, { monto: 30 }], secreto: "no devolver" }] });
    const resultado = await buscarDocumentosSeguro("12345678K");
    expect(resultado.compras).toEqual([{ id: "venta-ficticia", fecha: "2026-10-01", total: 100, abonado: 70, paciente: { nombre: "Paciente ficticio", rut: "12345678K" } }]);
  });
});
