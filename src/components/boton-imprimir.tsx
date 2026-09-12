"use client";

// "Imprimir o guardar PDF" y no solo "Imprimir": el cuadro que abre el
// navegador es el mismo para las dos cosas — para guardar el PDF hay que
// elegir "Guardar como PDF" en el destino — y si el botón solo dice
// imprimir, nadie que necesite mandar el papel por WhatsApp lo va a
// apretar.
export default function BotonImprimir({ etiqueta = "🖨 Imprimir o guardar PDF" }: { etiqueta?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark print:hidden"
    >
      {etiqueta}
    </button>
  );
}
