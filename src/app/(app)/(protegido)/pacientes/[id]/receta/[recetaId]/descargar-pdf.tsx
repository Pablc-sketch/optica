"use client";

import { useState } from "react";
import { construirPdfReceta } from "@/lib/pdf-receta";
import { nombreArchivoReceta, type DatosRecetaImpresion } from "@/lib/receta-datos";

export default function DescargarPdf({ datos }: { datos: DatosRecetaImpresion }) {
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const doc = await construirPdfReceta(datos);
      doc.save(nombreArchivoReceta(datos.pacienteNombre));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={descargar}
      disabled={generando}
      className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema disabled:opacity-60"
    >
      {generando ? "Generando…" : "⬇️ Guardar como PDF"}
    </button>
  );
}
