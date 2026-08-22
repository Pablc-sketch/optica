"use server";

import { Resend } from "resend";
import { construirHtmlReceta } from "@/lib/email-receta-html";
import { nombreArchivoReceta, type DatosRecetaImpresion } from "@/lib/receta-datos";

// El envío automático necesita una cuenta de Resend configurada (variables
// RESEND_API_KEY / RESEND_FROM_EMAIL en Vercel). Sin dominio propio
// verificado en Resend, el remitente de prueba (onboarding@resend.dev) solo
// puede mandar al correo con el que se creó la cuenta de Resend — a
// cualquier paciente recién funciona una vez que se verifique un dominio.
export async function enviarRecetaPorCorreo(input: {
  destino: string;
  pacienteNombre: string;
  datos: DatosRecetaImpresion;
  pdfBase64: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      error: "El envío automático todavía no está activado en esta óptica.",
    };
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL || "Recetas <onboarding@resend.dev>";

  const { error } = await resend.emails.send({
    from,
    to: input.destino,
    subject: `Receta óptica — ${input.pacienteNombre}`,
    html: construirHtmlReceta(input.datos, input.pacienteNombre.split(" ")[0]),
    attachments: [
      {
        filename: nombreArchivoReceta(input.pacienteNombre),
        content: input.pdfBase64,
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
