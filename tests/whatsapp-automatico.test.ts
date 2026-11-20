import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const ctx = vi.hoisted(() => ({ analizar: vi.fn(), enviar: vi.fn() }));
vi.mock("@/lib/asistente/analizar-chat", () => ({ analizarChat: ctx.analizar }));
vi.mock("resend", () => ({ Resend: class { emails = { send: ctx.enviar }; } }));

import { debePreinscribir, revisarChatAutomatico } from "@/lib/whatsapp-automatico";
import { notaAprendida } from "@/lib/whatsapp-bandeja";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OP = { id: "op-labrador", nombre: "Junta de Vecinos Labrador", fecha: "2030-03-07", fecha_fin: null, comuna: "Talagante", direccion: null, sectores: null };

// Base falsa (llave de servicio) que registra filtros y escrituras.
function base(datos: { ultimo?: string; estado?: string; yaInscrito?: boolean; cupo?: boolean }) {
  const escrito: { tabla: string; accion: string; datos: unknown }[] = [];
  const filtros: { tabla: string; columna: string; valor: unknown }[] = [];
  const db = {
    rpc: vi.fn(async () => ({ data: datos.cupo ?? true, error: null })),
    from(tabla: string) {
      const resp = (): unknown => {
        if (tabla === "whatsapp_mensajes") return { data: [{ wamid: datos.ultimo ?? "w2", direccion: "entrante", texto: "Soy de Labrador, quiero hora", enviado_en: "2030-03-01T10:00:00Z" }], error: null };
        if (tabla === "whatsapp_chats") return { data: { nombre_perfil: "Rosa", estado: datos.estado ?? "pendiente" }, error: null };
        if (tabla === "operativos") return { data: [OP], error: null };
        if (tabla === "inscritos_operativo") return { data: datos.yaInscrito ? [{ id: "x" }] : [], error: null };
        if (tabla === "users") return { data: [{ email: "admin@ejemplo.invalid" }], error: null };
        return { data: [], error: null };
      };
      const q: Record<string, unknown> = {};
      Object.assign(q, {
        select: () => q, neq: () => q, in: () => q, or: () => q, order: () => q,
        eq: (columna: string, valor: unknown) => (filtros.push({ tabla, columna, valor }), q),
        limit: () => Object.assign(Promise.resolve(resp()), { maybeSingle: async () => {
          const r = resp() as { data: unknown[] }; return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: null };
        } }),
        maybeSingle: async () => resp(),
        update: (d: unknown) => (escrito.push({ tabla, accion: "update", datos: d }), q),
        insert: async (d: unknown) => (escrito.push({ tabla, accion: "insert", datos: d }), { error: null }),
      });
      return q;
    },
  };
  return { db, escrito, filtros };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "clave-ficticia");
  vi.stubEnv("RESEND_API_KEY", "clave-ficticia");
  ctx.analizar.mockResolvedValue({ quiere_atenderse: true, sector: "Labrador", operativo_id: "op-labrador", nombre: null, edad: 54, confianza: "alta", motivo: "Labrador coincide con la junta" });
});

describe("revisión automática de WhatsApp", () => {
  it("preinscribe POR CONFIRMAR en el operativo de la sede, avisa por correo y no responde a la persona", async () => {
    const fetchEspia = vi.spyOn(globalThis, "fetch");
    const { db, escrito, filtros } = base({});
    await revisarChatAutomatico(db as never, TENANT, "56911112222", "w2", 0);
    const insert = escrito.find((e) => e.tabla === "inscritos_operativo");
    expect(insert?.datos).toMatchObject({ tenant_id: TENANT, operativo_id: "op-labrador", nombre: "Rosa", edad: 54, estado: "por_confirmar", origen: "whatsapp", sector: "Labrador" });
    expect(ctx.enviar).toHaveBeenCalledTimes(1);
    const correo = ctx.enviar.mock.calls[0][0] as { subject: string; html: string };
    expect(correo.subject).toBe("Por confirmar: Rosa (54 años) → Junta de Vecinos Labrador");
    expect(correo.html).not.toContain("56911112222");
    expect(fetchEspia).not.toHaveBeenCalled();
    for (const t of ["whatsapp_mensajes", "whatsapp_chats", "operativos", "inscritos_operativo"]) {
      expect(filtros).toContainEqual({ tabla: t, columna: "tenant_id", valor: TENANT });
    }
    fetchEspia.mockRestore();
  });

  it("si llegó otro mensaje después, espera a ese (no analiza dos veces)", async () => {
    const { db, escrito } = base({ ultimo: "w3" });
    await revisarChatAutomatico(db as never, TENANT, "56911112222", "w2", 0);
    expect(ctx.analizar).not.toHaveBeenCalled();
    expect(escrito).toEqual([]);
  });

  it("no vuelve a proponer si ya está anotada, ni si el chat fue descartado, ni sin cupo de IA", async () => {
    for (const d of [{ yaInscrito: true }, { estado: "descartado" }, { cupo: false }]) {
      const { db, escrito } = base(d);
      await revisarChatAutomatico(db as never, TENANT, "56911112222", "w2", 0);
      expect(escrito.filter((e) => e.tabla === "inscritos_operativo")).toEqual([]);
    }
    expect(ctx.enviar).not.toHaveBeenCalled();
  });

  it("con poca confianza o sin operativo no preinscribe (queda solo como sugerencia)", () => {
    const s = { quiere_atenderse: true, sector: "x", operativo_id: "op", nombre: "Ana", edad: null, confianza: "alta" as const, motivo: "" };
    expect(debePreinscribir(s, null)).toEqual({ nombre: "Ana" });
    expect(debePreinscribir({ ...s, confianza: "baja" }, null)).toBeNull();
    expect(debePreinscribir({ ...s, operativo_id: null }, null)).toBeNull();
    expect(debePreinscribir({ ...s, quiere_atenderse: false }, null)).toBeNull();
    expect(debePreinscribir({ ...s, nombre: null }, null)).toBeNull();
  });

  it("aprende el sector al confirmar, sin repetir", () => {
    const op = { nombre: "Junta de Vecinos Labrador", comuna: "Talagante" };
    expect(notaAprendida("El Rosario", op, [])).toBe("«El Rosario» corresponde a operativos en «Junta de Vecinos Labrador» (Talagante).");
    expect(notaAprendida("El Rosario", op, ["«El Rosario» corresponde a operativos en «Otra»."])).toBeNull();
    expect(notaAprendida("Labrador", op, [])).toBeNull(); // ya está en el nombre
    expect(notaAprendida(null, op, [])).toBeNull();
  });
});
