"use server";
import { generateText } from "ai";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { fechaLegible } from "@/lib/fechas";
import { prepararMensajeIA } from "@/lib/mensaje-optica-ia";

// Protección local adicional; no sustituye los límites de consumo de Gateway.
const ultimoUso = new Map<string, number>();
export async function generarMensajeOperativo(input: { operativoId: string; instrucciones: string }): Promise<{ texto?: string; error?: string }> {
  let ctx;
  try { ctx = await requerirPerfil({ roles: ["admin"], suscripcion: true }); }
  catch (e) { if (e instanceof SinPermiso) return { error: e.message }; throw e; }
  if (!input || typeof input.operativoId !== "string" || !/^[a-f0-9-]{36}$/i.test(input.operativoId)
    || typeof input.instrucciones !== "string" || !input.instrucciones.trim() || input.instrucciones.length > 1500) return { error: "Escribe el mensaje que necesitas (máximo 1.500 caracteres)." };
  const [op, tenant] = await Promise.all([
    ctx.supabase.from("operativos").select("nombre, direccion, lugar_entrega, fecha_entrega_estimada, hora_entrega")
      .eq("id", input.operativoId).eq("tenant_id", ctx.tenantId).maybeSingle(),
    ctx.supabase.from("tenants").select("nombre_comercial").eq("id", ctx.tenantId).single(),
  ]);
  if (op.error || tenant.error || !op.data || !tenant.data) return { error: "No se pudieron leer los datos guardados del operativo." };
  if (!process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY) return { error: "Falta habilitar la conexión de IA en el servidor. Puedes usar la plantilla básica mientras tanto." };
  const ahora = Date.now();
  if (ahora - (ultimoUso.get(ctx.user.id) ?? 0) < 10000) return { error: "Espera unos segundos antes de generar otro mensaje." };
  if (ultimoUso.size > 1000) ultimoUso.clear();
  ultimoUso.set(ctx.user.id, ahora);
  try {
    const prompt = prepararMensajeIA({ optica: tenant.data.nombre_comercial || "la óptica", operativo: op.data.nombre,
      lugar: op.data.lugar_entrega || op.data.direccion, fecha: op.data.fecha_entrega_estimada ? fechaLegible(op.data.fecha_entrega_estimada) : null,
      horario: op.data.hora_entrega }, input.instrucciones);
    const r = await generateText({ model: process.env.AI_GATEWAY_MODEL || "google/gemini-3.8-flash", ...prompt,
      maxOutputTokens: 1000, maxRetries: 0, abortSignal: AbortSignal.timeout(25000) });
    const texto = r.text.trim();
    if (!texto) return { error: "La IA no devolvió un borrador. Reintenta o usa la plantilla básica." };
    return { texto: texto.slice(0, 4000) };
  } catch {
    // No devolver respuestas del proveedor: pueden incluir datos internos.
    return { error: "La IA no está disponible. Puede faltar activar AI Gateway o sus créditos. Puedes editar la plantilla básica." };
  }
}
