import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import {
  ESQUEMA_SUGERENCIA, SISTEMA_BANDEJA, entradaParaIA, validarSugerencia,
  type MensajeParaIA, type OperativoParaChat, type Sugerencia,
} from "@/lib/whatsapp-bandeja";

export const MODELO_IA = "claude-opus-5-5";

// Pide a Claude que lea un chat y proponga operativo, nombre y edad.
// La respuesta viene con esquema fijo y se valida contra la lista real.
export async function analizarChat(
  client: Anthropic,
  operativos: OperativoParaChat[],
  mensajes: MensajeParaIA[],
  nombrePerfil: string | null,
  notas: string[] = []
): Promise<Sugerencia | null> {
  const r = await client.beta.messages.parse({
    model: MODELO_IA,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaJSONSchemaOutputFormat(ESQUEMA_SUGERENCIA) },
    system: SISTEMA_BANDEJA,
    messages: [{ role: "user", content: entradaParaIA(operativos, mensajes, nombrePerfil, notas) }],
  });
  if (r.stop_reason === "refusal") return null;
  return validarSugerencia(r.parsed_output, new Set(operativos.map((o) => o.id)));
}
