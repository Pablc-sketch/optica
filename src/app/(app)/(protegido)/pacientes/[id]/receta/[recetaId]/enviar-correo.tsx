"use client";

import { useState } from "react";
import { construirPdfReceta } from "@/lib/pdf-receta";
import { construirTextoReceta, type DatosRecetaImpresion } from "@/lib/receta-datos";
import { enviarRecetaPorCorreo } from "@/lib/actions/correo";

// Primero intenta mandar el correo solo (con la receta en PDF adjunto, vía
// Resend). Si todavía no está activado o falla por lo que sea, el paciente
// no se queda sin nada: abajo siempre queda a mano abrir Gmail con la
// receta ya escrita, para mandarla a mano.
export default function EnviarRecetaCorreo({
  pacienteNombre,
  emailDefault,
  datos,
}: {
  pacienteNombre: string;
  emailDefault: string;
  datos: DatosRecetaImpresion;
}) {
  const [email, setEmail] = useState(emailDefault);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function validar(): string | null {
    const destino = email.trim();
    if (!destino) return "Escribe el correo del paciente primero.";
    if (!destino.includes("@")) return "Ese correo no parece válido.";
    return null;
  }

  function abrirGmail() {
    const v = validar();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    const destino = email.trim();
    const asunto = `Receta óptica — ${pacienteNombre}`;
    const cuerpo = `Hola ${pacienteNombre.split(" ")[0]},\n\nAquí tienes tu receta óptica:\n\n${construirTextoReceta(datos)}`;
    const gmail =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(destino)}` +
      `&su=${encodeURIComponent(asunto)}` +
      `&body=${encodeURIComponent(cuerpo)}`;
    window.open(gmail, "_blank", "noopener");
  }

  async function enviarAutomatico() {
    const v = validar();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setExito(null);
    setEnviando(true);
    try {
      const destino = email.trim();
      const doc = await construirPdfReceta(datos);
      const uri = doc.output("datauristring");
      const pdfBase64 = uri.substring(uri.indexOf("base64,") + 7);

      const resultado = await enviarRecetaPorCorreo({ destino, pacienteNombre, datos, pdfBase64 });
      if (resultado.ok) {
        setExito(`Correo enviado a ${destino}.`);
      } else {
        setError(resultado.error);
      }
    } catch {
      setError("No se pudo enviar el correo. Prueba abriéndolo en Gmail.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema"
      >
        ✉️ Enviar por correo
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="correo@ejemplo.com"
          autoFocus
          className="w-52 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={enviarAutomatico}
          disabled={enviando}
          className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white disabled:opacity-60"
        >
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {error && (
        <div className="flex flex-col items-end gap-0.5">
          <p className="text-xs font-medium text-red-700">{error}</p>
          <button type="button" onClick={abrirGmail} className="text-xs font-medium text-brand-dark underline">
            Abrir en Gmail en su lugar
          </button>
        </div>
      )}
      {exito && <p className="text-xs font-medium text-green-700">{exito}</p>}
      {!error && !exito && (
        <button type="button" onClick={abrirGmail} className="text-xs text-tinta-suave underline">
          o abrir en Gmail
        </button>
      )}
    </div>
  );
}
