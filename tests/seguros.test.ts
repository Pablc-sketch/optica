import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepararBusquedaSeguro } from "../src/lib/seguros-busqueda";

const { requerirPerfil, from, query } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq", "ilike", "order"]) query[metodo] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: [], error: null }));
  query.maybeSingle = vi.fn();
  const from = vi.fn(() => query);
  return { requerirPerfil: vi.fn(), from, query };
});
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil, SinPermiso: class SinPermiso extends Error {} }));
import { buscarDocumentosSeguro, cargarCompraReembolso } from "../src/lib/actions/seguros";
import { SinPermiso } from "../src/lib/autorizacion";

beforeEach(() => {
  vi.clearAllMocks();
  requerirPerfil.mockResolvedValue({ supabase: { from }, tenantId: "optica-prueba" });
  query.limit.mockResolvedValue({ data: [], error: null });
});

describe("carga del expediente de una compra", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("comprueba el rol antes de consultar documentos", async () => {
    requerirPerfil.mockRejectedValueOnce(new SinPermiso("Sin acceso"));
    await expect(cargarCompraReembolso(id)).rejects.toThrow("Sin acceso");
    expect(from).not.toHaveBeenCalled();
  });
  it("descarta identificadores ajenos al formato esperado", async () => {
    expect(await cargarCompraReembolso("texto,id.eq.otro")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it("limita venta y óptica al negocio de la sesión y normaliza los pagos", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: { id, fecha: "2026-10-01", total: 100, anulada: false, pacientes: [{ nombre: "Prueba", rut: null }], venta_items: [], pagos_abonos: [{ id: "b", fecha: "2026-10-09" }, { id: "a", fecha: "2026-10-01" }] }, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data: { nombre_comercial: "Prueba", razon_social: null, rut_empresa: null }, error: null });
    const compra = await cargarCompraReembolso(id);
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "optica-prueba");
    expect(query.eq).toHaveBeenCalledWith("id", "optica-prueba");
    expect(query.eq).toHaveBeenCalledWith("id", id);
    expect(compra?.paciente?.nombre).toBe("Prueba");
    expect(compra?.pagos.map(p => p.id)).toEqual(["a", "b"]);
  });
  it("no mezcla documentos si falla una de las consultas", async () => {
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    query.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: "detalle privado" } });
    await expect(cargarCompraReembolso(id)).rejects.toThrow("No pudimos cargar");
  });
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
