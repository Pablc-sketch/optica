"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { anularVenta } from "@/lib/actions/ventas";

export default function AnularVenta({ ventaId, compacto }: { ventaId: string; compacto?: boolean }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirmando(true);
        }}
        className={
          compacto
            ? "rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50"
            : "rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition hover:bg-red-50"
        }
      >
        Anular venta
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-red-50 p-3 text-xs text-red-800" onClick={(e) => e.stopPropagation()}>
      <p>¿Anular esta venta? Se devuelve el stock y se cancela la orden de trabajo ligada (si no se ha entregado). No se puede deshacer.</p>
      <input
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Motivo (opcional): venta de prueba, cliente equivocado…"
        className="rounded-lg border border-red-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-red-400"
      />
      <div className="flex items-center gap-2">
        <button
          disabled={enviando}
          onClick={async () => {
            setEnviando(true);
            setError(null);
            const formData = new FormData();
            formData.set("venta_id", ventaId);
            formData.set("motivo", motivo);
            const resultado = await anularVenta(formData);
            setEnviando(false);
            if (resultado.ok) {
              setConfirmando(false);
              router.refresh();
            } else {
              setError(resultado.error);
            }
          }}
          className="rounded-lg bg-red-600 px-2.5 py-1 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {enviando ? "Anulando…" : "Sí, anular"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-red-300 px-2.5 py-1 font-medium text-red-700 transition hover:bg-red-100"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="font-medium">{error}</p>}
    </div>
  );
}
