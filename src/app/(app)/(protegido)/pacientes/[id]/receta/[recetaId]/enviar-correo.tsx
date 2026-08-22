"use client";

import { useState } from "react";

// Sin un servicio de envío de correo configurado (Resend, SendGrid, etc.)
// no hay forma de mandar el correo automático con el PDF adjunto desde el
// servidor. Mientras tanto, esto abre la app de correo del propio celular
// con el destinatario y el link a la receta ya cargados — el dueño de la
// óptica manda el correo desde su cuenta, en dos toques.
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

  function enviar() {
    if (!email.trim()) return;
    const urlCompleta = typeof window !== "undefined" ? `${window.location.origin}${urlReceta}` : urlReceta;
    const asunto = `Receta óptica — ${pacienteNombre}`;
    const cuerpo = `Hola ${pacienteNombre.split(" ")[0]},\n\nAdjuntamos el link de tu receta óptica:\n${urlCompleta}\n\nDesde ahí podés verla o guardarla como PDF.`;
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
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
    <div className="flex items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="correo@ejemplo.com"
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
  );
}
