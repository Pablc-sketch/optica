import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { analizarChat } from "@/lib/asistente/analizar-chat";
import { entradaParaIA, necesitaAnalisis, normalizarTelefonoChile, validarSugerencia, type OperativoParaChat } from "@/lib/whatsapp-bandeja";

// Datos ficticios.
const OPS: OperativoParaChat[] = [
  { id: "op-talagante", nombre: "Junta de Vecinos Labrador", fecha: "2030-03-07", fecha_fin: null, comuna: "Talagante", direccion: "Sede Labrador s/n", sectores: "Labrador, Villa El Rosario" },
  { id: "op-maipu", nombre: "Condominio Las Flores", fecha: "2030-03-09", fecha_fin: null, comuna: "Maipú", direccion: null, sectores: null },
];
const MENSAJES = [
  { direccion: "entrante" as const, texto: "Hola, soy de la sede de Labrador, quiero hora para mi mamá", enviado_en: "2030-03-01T10:00:00Z" },
  { direccion: "saliente" as const, texto: "Hola, ¿nombre y edad?", enviado_en: "2030-03-01T10:05:00Z" },
  { direccion: "entrante" as const, texto: "Marta Soto, 67 años", enviado_en: "2030-03-01T10:06:00Z" },
];

describe("bandeja de WhatsApp", () => {
  it("lo que va a la IA: operativos con sectores y el chat, sin teléfono", () => {
    const e = entradaParaIA(OPS, MENSAJES, "Rosa");
    expect(e).toContain("id=op-talagante | Junta de Vecinos Labrador | 2030-03-07 | comuna Talagante");
    expect(e).toContain("sectores: Labrador, Villa El Rosario");
    expect(e).toContain("PERSONA: Hola, soy de la sede de Labrador");
    expect(e).toContain("ÓPTICA: Hola, ¿nombre y edad?");
    expect(e).not.toMatch(/569\d{8}/);
  });

  it("valida la sugerencia: el operativo debe existir y la edad ser razonable", () => {
    const ids = new Set(OPS.map((o) => o.id));
    const ok = validarSugerencia({ quiere_atenderse: true, sector: "Labrador", operativo_id: "op-talagante",
      personas: [{ nombre: "Marta Soto", edad: 67 }, { nombre: "Tomás  Soto", edad: 9 }, { nombre: "marta soto", edad: 67 }], confianza: "alta", motivo: "Labrador está en los sectores" }, ids);
    expect(ok).toEqual({ quiere_atenderse: true, sector: "Labrador", operativo_id: "op-talagante",
      personas: [{ nombre: "Marta Soto", edad: 67 }, { nombre: "Tomás Soto", edad: 9 }], confianza: "alta", motivo: "Labrador está en los sectores" });
    const inventado = validarSugerencia({ quiere_atenderse: true, sector: null, operativo_id: "op-de-otra-optica", personas: [{ nombre: "X", edad: 300 }, { nombre: "Ana", edad: 300 }], confianza: "alta", motivo: "x" }, ids);
    expect(inventado).toMatchObject({ operativo_id: null, personas: [{ nombre: "Ana", edad: null }], confianza: "baja" });
    expect(validarSugerencia("texto", ids)).toBeNull();
  });

  it("analiza un chat con Claude (simulado) y valida la respuesta", async () => {
    const parse = vi.fn(async () => ({
      stop_reason: "end_turn",
      parsed_output: { quiere_atenderse: true, sector: "Labrador", operativo_id: "op-talagante", personas: [{ nombre: "Marta Soto", edad: 67 }], confianza: "alta", motivo: "Coincide con Labrador" },
    }));
    const client = { beta: { messages: { parse } } };
    const s = await analizarChat(client as never, OPS, MENSAJES, "Rosa");
    expect(s?.operativo_id).toBe("op-talagante");
    expect(s?.personas).toEqual([{ nombre: "Marta Soto", edad: 67 }]);
    const pedido = (parse.mock.calls[0] as unknown[])[0] as { model: string; messages: { content: string }[]; output_config: { format: unknown } };
    expect(pedido.model).toBe("claude-opus-5-5");
    expect(pedido.output_config.format).toBeTruthy();
    expect(pedido.messages[0].content).not.toMatch(/569\d{8}/);
  });

  it("solo reanaliza chats con mensajes nuevos de la persona", () => {
    expect(necesitaAnalisis({ estado: "pendiente", ultimo_entrante_en: "2030-01-02", analizado_en: null })).toBe(true);
    expect(necesitaAnalisis({ estado: "pendiente", ultimo_entrante_en: "2030-01-02", analizado_en: "2030-01-03" })).toBe(false);
    expect(necesitaAnalisis({ estado: "inscrito", ultimo_entrante_en: "2030-01-04", analizado_en: "2030-01-03" })).toBe(false);
    expect(necesitaAnalisis({ estado: "pendiente", ultimo_entrante_en: null, analizado_en: null })).toBe(false);
  });

  it("normaliza teléfonos chilenos escritos a mano", () => {
    expect(normalizarTelefonoChile("9 1234 5678")).toBe("56912345678");
    expect(normalizarTelefonoChile("+56 9 1234 5678")).toBe("56912345678");
    expect(normalizarTelefonoChile("12345678")).toBe("56912345678");
    expect(normalizarTelefonoChile("123")).toBeNull();
  });
});
