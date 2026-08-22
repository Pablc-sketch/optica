"use client";

import { useState } from "react";

// Sin un servicio de envío de correo configurado (Resend, SendGrid, etc.)
// no hay forma de mandar el correo automático con el PDF adjunto desde el
// servidor. Mientras tanto abre Gmail directo (el link de "compose" de
// mail.google.com, no un mailto:) con el destinatario y el mensaje ya
// cargados — mailto: depende de que el dispositivo tenga una app de
// correo asociada como default, y en varios celulares Android no hace
// nada; el link de Gmail es una URL común, así que siempre abre.
export default function EnviarRecetaCorreo({
  pacienteNombre,
  emailDefault,
  urlReceta,
}: {
  pacienteNombre: string;
  emailDefault: string;
  urlReceta: string;
}) {
  const [email, setEmail] = useState(emailDefault);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function enviar() {
    const destino = email.trim();
    if (!destino) {
      setError("Escribí el correo del paciente primero.");
      return;
    }
    if (!destino.includes("@")) {
      setError("Ese correo no parece válido.");
      return;
    }
    setError(null);

    const urlCompleta = typeof window !== "undefined" ? `${window.location.origin}${urlReceta}` : urlReceta;
    const asunto = `Receta óptica — ${pacienteNombre}`;
    const cuerpo = `Hola ${pacienteNombre.split(" ")[0]},\n\nAdjuntamos el link de tu receta óptica:\n${urlCompleta}\n\nDesde ahí podés verla o guardarla como PDF.`;

    const gmail =
      "https://mail.google.com/mail/?view=cm&fs=1" +
      `&to=${encodeURIComponent(destino)}` +
      `&su=${encodeURIComponent(asunto)}` +
      `&body=${encodeURIComponent(cuerpo)}`;

    window.open(gmail, "_blank", "noopener");
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
          onClick={enviar}
          className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white"
        >
          Enviar
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      <p className="text-xs text-tinta-suave">Abre Gmail con el correo ya redactado.</p>
    </div>
  );
}
