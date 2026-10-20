"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clp } from "@/lib/clp";
import { formatearMonto, montoANumero } from "@/lib/formato";
import { deshacerSueldoPagado, guardarAyudante, marcarFidesPagado, marcarSueldoPagado } from "@/lib/actions/cierre";

type Props =
  | { tipo: "sueldo"; operativoId: string; persona: "isadora" | "madre" | "pablo"; nombre: string; monto: number; pagado: number }
  | { tipo: "fides"; operativoId: string; nombreOperativo: string; monto: number; pagado: boolean }
  | { tipo: "ayudante"; operativoId: string; monto: number };

// Una fila de "a quién hay que pagar", con su botón grande.
export default function FilaPago(props: Props) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState(props.tipo === "ayudante" ? formatearMonto(props.monto) : "");
  const [caja, setCaja] = useState<"digital" | "efectivo">("digital");

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
            <p className="text-sm text-tinta-suave">Lo que le pagas. Se descuenta antes de repartir.</p>
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

  const nombre = props.tipo === "fides" ? "Fides (cristales)" : props.nombre;
  const yaPagado = props.tipo === "fides" ? props.pagado : props.pagado >= props.monto && props.monto > 0;
  const falta = props.tipo === "sueldo" ? Math.max(0, props.monto - props.pagado) : props.monto;

  return (
    <li className={`flex items-center justify-between gap-3 rounded-2xl p-4 shadow-sm ${yaPagado ? "bg-emerald-50" : "bg-white"}`}>
      <div className="min-w-0">
        <p className="text-lg font-bold">{nombre}</p>
        <p className="text-2xl font-bold tabular-nums">{clp(props.monto)}</p>
        {props.tipo === "sueldo" && props.pagado > 0 && !yaPagado && (
          <p className="text-sm text-tinta-suave">Ya se le pagó {clp(props.pagado)} · falta {clp(falta)}</p>
        )}
        {props.tipo === "sueldo" && !yaPagado && (
          <div className="mt-1 flex gap-1.5">
            {(
              [
                { valor: "digital", titulo: "Transferencia" },
                { valor: "efectivo", titulo: "Efectivo" },
              ] as const
            ).map((o) => (
              <button
                key={o.valor}
                type="button"
                onClick={() => setCaja(o.valor)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  caja === o.valor ? "border-tinta bg-tinta text-white" : "border-tinta/20 bg-white"
                }`}
              >
                {o.titulo}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
      </div>
      {yaPagado ? (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-emerald-700 px-3 py-1.5 text-sm font-bold text-white">✓ Pagado</span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              correr(() =>
                props.tipo === "fides"
                  ? marcarFidesPagado({ operativoId: props.operativoId, nombre: props.nombreOperativo, monto: props.monto, pagado: false })
                  : deshacerSueldoPagado({ operativoId: props.operativoId, persona: props.persona })
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
          disabled={pendiente || falta <= 0}
          onClick={() =>
            correr(() =>
              props.tipo === "fides"
                ? marcarFidesPagado({ operativoId: props.operativoId, nombre: props.nombreOperativo, monto: props.monto, pagado: true })
                : marcarSueldoPagado({ operativoId: props.operativoId, persona: props.persona, objetivo: props.monto, caja })
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
