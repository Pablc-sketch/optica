"use client";

import { useFormStatus } from "react-dom";

// Botón de formulario que se bloquea mientras guarda. Con la app lenta se
// tocaba "Guardar" dos o tres veces y quedaban registros repetidos.
export default function BotonEnviar({
  children,
  pendiente = "Guardando…",
  className,
}: {
  children: React.ReactNode;
  pendiente?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className ?? ""} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? pendiente : children}
    </button>
  );
}
