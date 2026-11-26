"use client";

import { useState } from "react";

export default function CopiarFolios({ texto, sede }: { texto: string; sede: string }) {
  const [estado, setEstado] = useState("");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("Folios copiados");
    } catch {
      setEstado("Selecciona el texto de los folios para copiarlo.");
    }
  }

  return <div className="mt-2 flex flex-wrap items-center gap-2">
    <button type="button" onClick={copiar} aria-label={`Copiar folios de ${sede}`}
      className="rounded-lg border border-tinta/20 bg-white px-3 py-1.5 text-xs font-semibold text-brand-dark hover:bg-crema">
      Copiar folios
    </button>
    <span role="status" className="text-xs text-tinta-suave">{estado}</span>
  </div>;
}
