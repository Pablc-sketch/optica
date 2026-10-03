"use server";

import { Resend } from "resend";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { construirHtmlReceta } from "@/lib/email-receta-html";
import { nombreArchivoReceta, type DatosRecetaImpresion } from "@/lib/receta-datos";

// El envío automático necesita una cuenta de Resend configurada (variables
// RESEND_API_KEY / RESEND_FROM_EMAIL en Vercel). Sin dominio propio
// verificado en Resend, el remitente de prueba (onboarding@resend.dev) solo
// puede mandar al correo con el que se creó la cuenta de Resend — a
// cualquier paciente recién funciona una vez que se verifique un dominio.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_PDF_BYTES = 3 * 1024 * 1024;

// Antes esta acción no revisaba sesión ni receta: cualquiera que diera con
// ella podía mandar cualquier correo, con cualquier adjunto, a cualquier
// destino, a nombre de la óptica (A08). Ahora exige una sesión activa con
// permiso clínico, la receta tiene que ser de la óptica de quien envía
// (RLS) y el nombre del paciente sale de la base, no del navegador.
export async function enviarRecetaPorCorreo(input: {
  recetaId: string;
  destino: string;
  datos: DatosRecetaImpresion;
  pdfBase64: string;
}) {
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "clinico", "ventas"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message };
    throw e;
  }

  const destino = String(input.destino ?? "").trim();
  if (!EMAIL.test(destino) || destino.length > 254) {
    return { ok: false as const, error: "Ese correo no parece válido." };
  }
  const { data: receta } = await supabase
    .from("recetas")
    .select("id, pacientes:paciente_id (nombre)")
    .eq("id", input.recetaId)
    .maybeSingle();
  const pacienteNombre = (receta?.pacientes as unknown as { nombre: string } | null)?.nombre;
  if (!receta || !pacienteNombre) return { ok: false as const, error: "Receta no encontrada." };

  // El adjunto tiene que ser un PDF y de tamaño razonable.
  const pdf = String(input.pdfBase64 ?? "");
  if (!pdf.startsWith("JVBER") || (pdf.length * 3) / 4 > MAX_PDF_BYTES) {
    return { ok: false as const, error: "El PDF de la receta no es válido." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      error: "El envío automático todavía no está activado en esta óptica.",
    };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "Recetas <onboarding@resend.dev>";
  const datos = { ...input.datos, pacienteNombre };

  const { error } = await resend.emails.send({
    from,
    to: destino,
    subject: `Receta óptica — ${pacienteNombre}`,
    html: construirHtmlReceta(datos, pacienteNombre.split(" ")[0]),
    attachments: [
      {
        filename: nombreArchivoReceta(pacienteNombre),
        content: pdf,
      },
    ],
  });

  if (error) {
    return {
      ok: false as const,
      error: `No se pudo enviar el correo (${error.message}). Prueba abriéndolo en Gmail.`,
    };
  }

  return { ok: true as const };
}
