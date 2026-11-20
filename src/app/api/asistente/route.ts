import Anthropic from "@anthropic-ai/sdk";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { crearHerramientas } from "@/lib/asistente/herramientas";
import { contextoDePagina, promptSistema, validarConversacion } from "@/lib/asistente/conversacion";
import { fechaConDia, hoyEnChile } from "@/lib/fechas";

// Asistente de IA de Lentia (Claude). Solo administradores. Cada pregunta
// se responde con la sesión del usuario: la IA solo puede leer, con las
// herramientas de src/lib/asistente/herramientas.ts, los totales de SU óptica.
// La conversación no se guarda en Lentia: vive en el navegador.

export const runtime = "nodejs";
export const maxDuration = 120;

const MODELO = "claude-opus-5-5";

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  } catch (e) {
    if (e instanceof SinPermiso) return Response.json({ error: e.message }, { status: 403 });
    throw e;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "El asistente aún no está activado: falta la clave de Claude en el servidor." }, { status: 503 });
  }
  const cuerpo = (await request.json().catch(() => null)) as { mensajes?: unknown; ruta?: unknown } | null;
  const mensajes = validarConversacion(cuerpo?.mensajes);
  if (!mensajes) return Response.json({ error: "Escribe tu pregunta (máximo 4.000 caracteres)." }, { status: 400 });

  // Tope diario por óptica, para que el gasto no se dispare.
  const cupo = await ctx.supabase.rpc("registrar_pregunta_asistente");
  if (cupo.error) return Response.json({ error: "No se pudo verificar el uso del asistente. Reintenta." }, { status: 503 });
  if (cupo.data !== true) return Response.json({ error: "Se alcanzó el máximo de preguntas de hoy. Mañana se renueva." }, { status: 429 });

  const tenant = await ctx.supabase.from("tenants").select("nombre_comercial").eq("id", ctx.tenantId).single();
  const hoy = hoyEnChile();
  const contexto = contextoDePagina(cuerpo?.ruta);
  const historial: Anthropic.Beta.BetaMessageParam[] = mensajes.map((m) => ({
    role: m.rol === "usuario" ? "user" : "assistant",
    content: m.texto,
  }));
  // Instrucción del sistema a mitad de conversación (no cambia el prefijo cacheado).
  if (contexto) historial.push({ role: "system", content: contexto });

  const client = new Anthropic({ maxRetries: 1, timeout: 100_000 });
  const herramientas = crearHerramientas(ctx.supabase, ctx.tenantId, hoy);
  // Búsqueda web (precio del combustible, hospedaje, etc.) en servidores de
  // Anthropic. Solo recibe lo que la IA busca, nunca datos de la óptica.
  const busqueda = { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 3,
    user_location: { type: "approximate" as const, country: "CL", timezone: "America/Santiago" } };
  const preguntar = (conWeb: boolean) =>
    client.beta.messages.toolRunner({
      model: MODELO,
      max_tokens: 16000,
      max_iterations: 10,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: promptSistema(tenant.data?.nombre_comercial || "la óptica", fechaConDia(hoy)),
      tools: conWeb ? [...herramientas, busqueda] : [...herramientas],
      messages: historial,
    });
  const conWeb = process.env.ASISTENTE_BUSQUEDA_WEB !== "0";
  try {
    let final;
    try {
      final = await preguntar(conWeb);
    } catch (e) {
      // Si la búsqueda web no está habilitada en la cuenta de Claude, se
      // responde igual sin ella.
      if (!(conWeb && e instanceof Anthropic.BadRequestError)) throw e;
      final = await preguntar(false);
    }
    if (final.stop_reason === "refusal") {
      return Response.json({ texto: "No puedo ayudar con esa pregunta. Prueba preguntando por tus operativos o su rentabilidad." });
    }
    const texto = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!texto) return Response.json({ error: "El asistente no alcanzó a responder. Prueba con una pregunta más acotada." }, { status: 502 });
    return Response.json({ texto: texto.slice(0, 20000) });
  } catch (e) {
    // No se devuelve el detalle del proveedor: puede traer datos internos.
    if (e instanceof Anthropic.AuthenticationError) return Response.json({ error: "La clave de Claude no es válida. Revísala en Vercel." }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return Response.json({ error: "Claude está ocupado. Espera un minuto y reintenta." }, { status: 429 });
    if (e instanceof Anthropic.APIError) return Response.json({ error: "Claude no respondió. Reintenta en un momento." }, { status: 502 });
    throw e;
  }
}
