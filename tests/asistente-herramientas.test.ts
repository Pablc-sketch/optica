import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { crearHerramientas } from "@/lib/asistente/herramientas";

// Supabase falso: guarda los filtros y devuelve filas ficticias por tabla.
function supabaseFalso(tablas: Record<string, unknown[]>) {
  const filtros: { tabla: string; columna: string; valor: unknown }[] = [];
  const cliente = {
    from(tabla: string) {
      const q = {
        select: () => q,
        eq: (columna: string, valor: unknown) => (filtros.push({ tabla, columna, valor }), q),
        not: () => q,
        neq: () => q,
        order: () => q,
        range: async () => ({ data: tablas[tabla] ?? [], error: null }),
        limit: async () => ({ data: tablas[tabla] ?? [], error: null }),
      };
      return q;
    },
  };
  return { cliente, filtros };
}

const TENANT = "11111111-1111-4111-8111-111111111111";
const OPERATIVO = {
  id: "op-a", nombre: "Junta Ficticia", tipo_venue: "junta_vecinos", fecha: "2026-01-10", fecha_fin: null, estado: "realizado",
  direccion: "Calle 1", comuna: "Maipú", region: "RM", hora_inicio: "10:00:00", hora_fin: "14:00:00", meta_examenes: 30,
  costo_transporte: 20000, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, costo_ayudante: 0, costo_equipos: 52000,
  costo_hospedaje: 0, costo_comida: 0, costo_peajes: 0, costo_marco_unitario: 0,
};

describe("herramientas del asistente", () => {
  it("leen solo la óptica de la sesión y no entregan datos de pacientes", async () => {
    const { cliente, filtros } = supabaseFalso({
      operativos: [OPERATIVO],
      recetas: [{ id: "r1", operativo_id: "op-a", paciente_id: "paciente-secreto" }],
      ventas: [{ id: "v1", operativo_id: "op-a", total: 120000, paciente_id: "paciente-secreto", venta_items: [] }],
      inscritos_operativo: [{ id: "c1", operativo_id: "op-a" }],
      contactos_operativo: [],
      sucursales: [{ nombre: "Casa matriz", direccion: "Calle Base 1, Santiago" }],
    });
    const [listar, detalle, comparar, evaluar, pendientes, costos, combustible] = crearHerramientas(cliente as never, TENANT, "2026-02-01");

    const salidas = [
      await listar.run({}),
      await detalle.run({ id: "op-a" }),
      await comparar.run({ agrupar_por: "comuna" }),
      await evaluar.run({ dias: 1, costo_transporte: 20000 }),
      await pendientes.run({}),
      await costos.run({}),
    ].map(String);

    for (const tabla of ["operativos", "recetas", "ventas", "inscritos_operativo", "contactos_operativo", "sucursales"]) {
      expect(filtros).toContainEqual({ tabla, columna: "tenant_id", valor: TENANT });
    }
    for (const s of salidas) expect(s).not.toContain("paciente-secreto");

    const lista = JSON.parse(salidas[0]);
    expect(lista.operativos[0]).toMatchObject({ examinados: 1, ventas: 1, vendido: 120000, utilidad: 48000, inscritos: 1 });
    expect(JSON.parse(salidas[1]).gastos_detalle.equipos).toBe(52000);
    expect(JSON.parse(await detalle.run({ id: "otro" }) as string).error).toBeTruthy();
    // Realizado y con costos anotados: no tiene pendientes.
    expect(JSON.parse(salidas[4]).operativos_con_pendientes).toBe(0);
    const ref = JSON.parse(salidas[5]);
    expect(ref.historial_propio_por_dia.transporte).toEqual({ promedio_por_dia: 20000, operativos: 1 });
    expect(ref.bases).toEqual(["Casa matriz: Calle Base 1, Santiago"]);
    expect(ref.respaldo_chile.combustible_litro.bencina_93).toBeGreaterThan(0);
    expect(JSON.parse(await combustible.run({ km_ida: 40, dias: 1, precio_litro: 1300, rendimiento_km_litro: 10 }) as string).costo).toBe(10400);
  });
});
