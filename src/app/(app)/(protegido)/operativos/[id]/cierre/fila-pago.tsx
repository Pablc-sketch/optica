"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clp } from "@/lib/clp";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { guardarAyudante, marcarFidesPagado } from "@/lib/actions/cierre";

type Props =
  | { tipo: "fides"; operativoId: string; nombreOperativo: string; monto: number; pagado: boolean }
  | { tipo: "ayudante"; operativoId: string; monto: number };

// Una fila de "a quién hay que pagar", con su botón grande.
export default function FilaPago(props: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState(props.tipo === "ayudante" ? formatearMonto(props.monto) : "");

  const correr = (f: () => Promise<{ ok: boolean; error?: string }>) =>
    iniciar(async () => {
      setError(null);
      const r = await f();
      if (!r.ok) setError(r.error ?? "No se pudo guardar");
      else router.refresh();
    });

  if (props.tipo === "ayudante") {
    return (
      <li className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-bold">Diego (ayudante)</p>
            <p className="text-sm text-tinta-suave">Costo previsto. Registra el pago por separado.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave">$</span>
            <input
              inputMode="numeric"
              value={texto}
              onChange={(e) => setTexto(formatearMonto(e.target.value))}
              placeholder="0"
              className="w-full rounded-xl border bg-white py-3 pl-7 text-lg font-bold tabular-nums"
            />
          </div>
          <button
            type="button"
            disabled={pendiente || montoANumero(texto) === props.monto}
            onClick={() => correr(() => guardarAyudante({ operativoId: props.operativoId, monto: montoANumero(texto) }))}
            className="rounded-xl bg-tinta px-5 py-3 font-semibold text-white disabled:opacity-40"
          >
            {pendiente ? "…" : "Guardar"}
          </button>
        </div>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      </li>
    );
  }

  return (
    <li className={`flex items-center justify-between gap-3 rounded-2xl p-4 shadow-sm ${props.pagado ? "bg-emerald-50" : "bg-white"}`}>
      <div className="min-w-0">
        <p className="text-lg font-bold">Fides (cristales)</p>
        <p className="text-2xl font-bold tabular-nums">{clp(props.monto)}</p>
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      </div>
      {props.pagado ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white">✓ Pagado</span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              correr(() =>
                marcarFidesPagado({ operativoId: props.operativoId, nombre: props.nombreOperativo, monto: props.monto, pagado: false })
              )
            }
            className="text-xs text-tinta-suave underline"
          >
            Deshacer
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={pendiente || props.monto <= 0}
          onClick={() =>
            correr(() =>
              marcarFidesPagado({ operativoId: props.operativoId, nombre: props.nombreOperativo, monto: props.monto, pagado: true })
            )
          }
          className="shrink-0 rounded-xl bg-emerald-800 px-5 py-4 text-base font-semibold text-white hover:bg-emerald-900 disabled:opacity-40"
        >
          {pendiente ? "Guardando…" : "Marcar pagado"}
        </button>
      )}
    </li>
  );
}
