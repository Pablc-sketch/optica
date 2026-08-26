"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarOT } from "@/lib/actions/ot";

export default function EliminarOT({
  otId,
  folio,
  compacto,
  irALista,
}: {
  otId: string;
  folio: number;
  compacto?: boolean;
  // El detalle de la OT deja de existir al borrarla: hay que salir al
  // tablero en vez de refrescar la misma página.
  irALista?: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirmando(true);
        }}
        title="Eliminar orden de trabajo"
        className={
          compacto
            ? "shrink-0 rounded-lg p-1.5 text-red-700 transition hover:bg-red-50"
            : "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
        }
      >
        {compacto ? "🗑" : "Eliminar OT"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
        <span>
          ¿Eliminar la OT #{folio}? Si tiene una venta sin pagos, también se borra esa venta y se
          devuelve el stock. No se puede deshacer.
        </span>
        <form
          action={async (formData) => {
            setBorrando(true);
            setError(null);
            const resultado = await eliminarOT(formData);
            setBorrando(false);
            if (resultado.ok) {
              if (irALista) router.push("/ot");
              else router.refresh();
            } else {
              setError(resultado.error);
              setConfirmando(false);
            }
          }}
        >
          <input type="hidden" name="ot_id" value={otId} />
          <button
            disabled={borrando}
            className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {borrando ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-red-300 px-2.5 py-1 font-medium text-red-700 transition hover:bg-red-100"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
