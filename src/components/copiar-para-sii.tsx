"use client";

import { useState } from "react";

// El portal del SII es un formulario detrás de ClaveÚnica y NO acepta datos
// por URL: no existe forma de pre-rellenarlo con un link. Lo más cerca que
// se puede estar sin la API certificada es dejar los datos copiados y listos
// para pegar. La emisión realmente automática requiere un proveedor DTE
// (SimpleAPI / OpenFactura) con certificado digital.

const URL_SII = "https://www.sii.cl/destacados/boleta_electronica_voucher/";

export default function CopiarParaSII({ texto }: { texto: string }) {
  const [estado, setEstado] = useState<"listo" | "copiado" | "manual">("listo");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
      setTimeout(() => setEstado("listo"), 4000);
    } catch {
      // navigator.clipboard falla sin HTTPS o si la ventana perdió el foco:
      // mostramos el texto para copiarlo a mano y no dejar al usuario sin salida.
      setEstado("manual");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-1.5 text-sm font-semibold text-tinta transition hover:bg-crema"
        >
          {estado === "copiado" ? "✓ Datos copiados" : "📋 Copiar datos para la boleta"}
        </button>
        <a
          href={URL_SII}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-semibold text-tinta-suave transition hover:bg-crema"
        >
          Abrir portal del SII ↗
        </a>
      </div>

      {estado === "manual" && (
        <div className="w-full max-w-md">
          <p className="mb-1 text-xs text-tinta-suave">
            No se pudo copiar solo. Seleccioná el texto y copialo con Ctrl+C:
          </p>
          <textarea
            readOnly
            rows={7}
            value={texto}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-tinta-suave/30 bg-white p-2 font-mono text-xs"
          />
        </div>
      )}
    </div>
  );
}
