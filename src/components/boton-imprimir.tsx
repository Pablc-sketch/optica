"use client";

export default function BotonImprimir({ etiqueta = "🖨 Imprimir" }: { etiqueta?: string }) {
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
