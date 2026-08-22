"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { eliminarPaciente } from "@/lib/actions/pacientes";

export default function EliminarPaciente({
  pacienteId,
  nombre,
  compacto,
  irALista,
}: {
  pacienteId: string;
  nombre: string;
  compacto?: boolean;
  // La ficha del paciente deja de existir al borrarlo: hay que salir a la
  // lista en vez de refrescar la misma página. Es un booleano (no una
  // función) porque el componente que la usa en la lista es un Server
  // Component y no puede pasar callbacks de cliente como prop.
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
        title="Eliminar paciente"
        className={
          compacto
            ? "shrink-0 rounded-lg p-1.5 text-red-700 transition hover:bg-red-50"
            : "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-50"
        }
      >
        {compacto ? "🗑" : "Eliminar paciente"}
      </button>
    );
  }

  return (
    <div
      className="flex flex-col items-end gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
        <span>¿Eliminar a {nombre}? No se puede deshacer.</span>
        <form
          action={async (formData) => {
            setBorrando(true);
            setError(null);
            const resultado = await eliminarPaciente(formData);
            setBorrando(false);
            if (resultado.ok) {
              if (irALista) router.push("/pacientes");
              else router.refresh();
            } else {
              setError(resultado.error);
              setConfirmando(false);
            }
          }}
        >
          <input type="hidden" name="paciente_id" value={pacienteId} />
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
