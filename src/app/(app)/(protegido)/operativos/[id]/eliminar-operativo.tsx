"use client";

import { useState, useTransition } from "react";
import { eliminarOperativoVacio } from "@/lib/actions/operativos";

// Solo se muestra cuando el operativo está vacío (sin recetas ni ventas):
// sirve para limpiar los repetidos que se crearon por tocar dos veces.
export default function EliminarOperativo({ id }: { id: string }) {
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();

  return (
    <section className="rounded-2xl border border-red-200 bg-white p-4 print:hidden">
      <p className="text-sm font-semibold">Este operativo está vacío</p>
      <p className="text-sm text-tinta-suave">
        No tiene recetas ni ventas. Si lo creaste repetido por error, lo puedes borrar.
      </p>
      {!confirmar ? (
        <button
          type="button"
          onClick={() => setConfirmar(true)}
          className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          Borrar este operativo
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await eliminarOperativoVacio(id);
                if (r && !r.ok) setError(r.error ?? "No se pudo borrar.");
              })
            }
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {pendiente ? "Borrando…" : "Sí, borrarlo"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmar(false)}
            className="rounded-lg border border-tinta/20 px-4 py-2 text-sm font-semibold"
          >
            Cancelar
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </section>
  );
}
