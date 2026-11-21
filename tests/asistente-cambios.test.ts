import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const ctx = vi.hoisted(() => ({ perfil: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({
  requerirPerfil: ctx.perfil,
  SinPermiso: class SinPermiso extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { validarCambios } from "@/lib/cambios-operativo";
import { crearHerramientas } from "@/lib/asistente/herramientas";
import { aplicarCambioOperativo } from "@/lib/actions/asistente";
import type { Propuesta } from "@/lib/cambios-operativo";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OP = "22222222-2222-4222-8222-222222222222";

// Supabase falso que registra lo que se escribe.
function falso(filas: Record<string, unknown[]> = {}) {
  const escrito: { tabla: string; accion: string; datos: unknown; filtros: [string, unknown][] }[] = [];
  const cliente = {
    from(tabla: string) {
      const filtros: [string, unknown][] = [];
      let accion = "select";
      let datos: unknown = null;
      const resultado = () => ({ data: accion === "select" ? filas[tabla] ?? [] : { id: OP }, error: null, count: (filas[tabla] ?? []).length });
      const q = {
        select: () => q, eq: (c: string, v: unknown) => (filtros.push([c, v]), q), neq: () => q, in: () => q, not: () => q, order: () => q,
        range: async () => resultado(), limit: async () => resultado(),
        maybeSingle: async () => ({ data: (filas[tabla] ?? [])[0] ?? null, error: null }),
        single: async () => { escrito.push({ tabla, accion, datos, filtros }); return resultado(); },
        update: (d: unknown) => ((accion = "update"), (datos = d), q),
        insert: async (d: unknown) => { escrito.push({ tabla, accion: "insert", datos: d, filtros }); return { error: null }; },
      };
      return q;
    },
  };
  return { cliente, escrito };
}

describe("cambios que propone el asistente", () => {
  it("valida campos, comuna real y horas", () => {
    expect(validarCambios({ direccion: "  Av. Siempre Viva 742 ", comuna: "talagante" })).toEqual({
      cambios: { direccion: "Av. Siempre Viva 742", comuna: "Talagante", region: "Metropolitana de Santiago" },
    });
    expect(validarCambios({ costo_transporte: "$40.000" })).toEqual({ cambios: { costo_transporte: 40000 } });
    expect(validarCambios({ fecha: "2030-01-01" })).toEqual({ error: "«fecha» no se puede cambiar desde el asistente." });
    expect(validarCambios({ comuna: "Narnia" })).toEqual({ error: "No encontré la comuna «Narnia»." });
    expect(validarCambios({ hora_inicio: "14:00", hora_fin: "10:00" })).toMatchObject({ error: expect.stringContaining("después") });
    expect(validarCambios({ costo_comida: -5 })).toMatchObject({ error: expect.any(String) });
    expect(validarCambios({ estado: "borrado" })).toMatchObject({ error: expect.any(String) });
  });

  it("la herramienta solo prepara el cambio (no escribe) y guarda el valor anterior", async () => {
    const { cliente, escrito } = falso({
      operativos: [{ id: OP, nombre: "Junta Labrador", fecha: "2030-03-07", estado: "planificado", direccion: null, comuna: null,
        costo_transporte: 0, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0 }],
    });
    const propuestas: Propuesta[] = [];
    const herramientas = crearHerramientas(cliente as never, TENANT, "2030-03-01", { propuestas, usuarioId: "u1" });
    const proponer = herramientas[7];
    const r = JSON.parse(String(await proponer.run({ operativo_id: OP, cambios: { direccion: "Sede Labrador s/n", comuna: "Talagante" }, motivo: "Faltaba la ubicación" })));
    expect(r.ok).toBe(true);
    expect(propuestas).toEqual([{
      operativo_id: OP, operativo: "Junta Labrador", motivo: "Faltaba la ubicación",
      cambios: { direccion: "Sede Labrador s/n", comuna: "Talagante", region: "Metropolitana de Santiago" },
      antes: { direccion: null, comuna: null, region: null },
    }]);
    expect(escrito.filter((e) => e.tabla === "operativos")).toEqual([]);
    const otro = JSON.parse(String(await proponer.run({ operativo_id: "33333333-3333-4333-8333-333333333333", cambios: { direccion: "x" }, motivo: "x" })));
    expect(otro.error).toContain("No existe");
  });

  it("recordar guarda la nota en la óptica de la sesión", async () => {
    const { cliente, escrito } = falso({ ia_conocimiento: [] });
    const recordar = crearHerramientas(cliente as never, TENANT, "2030-03-01", { propuestas: [], usuarioId: "u1" })[8];
    await recordar.run({ texto: "Labrador es un sector de Talagante" });
    expect(escrito).toContainEqual(expect.objectContaining({ tabla: "ia_conocimiento", accion: "insert",
      datos: { tenant_id: TENANT, texto: "Labrador es un sector de Talagante", origen: "manual", creado_por: "u1" } }));
  });

  it("aplicar: solo administrador, revalida y deja historial", async () => {
    const { cliente, escrito } = falso({ operativos: [{ direccion: null, comuna: null, region: null }] });
    ctx.perfil.mockResolvedValue({ supabase: cliente, tenantId: TENANT, user: { id: "u1" }, rol: "admin" });
    expect(await aplicarCambioOperativo({ operativoId: OP, cambios: { fecha: "2030-01-01" } })).toEqual({ error: "«fecha» no se puede cambiar desde el asistente." });
    expect(await aplicarCambioOperativo({ operativoId: OP, cambios: { direccion: "Sede Labrador s/n" } })).toEqual({ mensaje: "Guardado" });
    const update = escrito.find((e) => e.tabla === "operativos" && e.accion === "update");
    expect(update?.datos).toEqual({ direccion: "Sede Labrador s/n" });
    expect(update?.filtros).toContainEqual(["tenant_id", TENANT]);
    expect(escrito).toContainEqual(expect.objectContaining({ tabla: "asistente_cambios", accion: "insert" }));
    expect(ctx.perfil).toHaveBeenCalledWith({ roles: ["admin"], suscripcion: true });
  });
});
