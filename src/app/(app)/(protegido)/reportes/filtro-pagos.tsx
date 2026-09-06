"use client";

import { useMemo, useState } from "react";
import { clp } from "@/lib/clp";
import { fechaLegible } from "@/lib/fechas";

const MEDIOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
};

const FILTROS = ["todos", "efectivo", "debito", "credito", "transferencia"] as const;

export type PagoDetalle = { fecha: string; monto: number; medioPago: string; paciente: string | null };

// Para cuadrar la plata real (cuánto efectivo hay en la mano vs. cuánto
// llegó por tarjeta/transferencia) sin tener que sumar a mano cada abono de
// la lista — se filtra por medio de pago y el subtotal se recalcula solo.
export default function FiltroPagos({ pagos }: { pagos: PagoDetalle[] }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>("todos");

  const filtrados = useMemo(
    () => (filtro === "todos" ? pagos : pagos.filter((p) => p.medioPago === filtro)),
    [pagos, filtro]
  );
  const subtotal = filtrados.reduce((s, p) => s + p.monto, 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
              filtro === f ? "bg-brand text-white" : "bg-crema-claro text-tinta-suave hover:bg-brand/10"
            }`}
          >
            {f === "todos" ? "Todos" : MEDIOS_PAGO[f]}
          </button>
        ))}
      </div>

      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {filtrados.length === 0 ? (
          <p className="text-sm text-tinta-suave">Sin abonos {filtro !== "todos" ? `en ${MEDIOS_PAGO[filtro]}` : ""} en este período.</p>
        ) : (
          filtrados.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-xs text-tinta-suave">{fechaLegible(p.fecha.slice(0, 10))}</span>
              <span className="flex-1 truncate">{p.paciente ?? "Sin paciente"}</span>
              <span className="rounded-full bg-crema-claro px-2 py-0.5 text-xs font-medium text-tinta-suave">
                {MEDIOS_PAGO[p.medioPago] ?? p.medioPago}
              </span>
              <span className="font-semibold">{clp(p.monto)}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between rounded-lg bg-brand/10 px-2 py-1.5 text-sm font-bold text-brand-dark">
        <span>{filtro === "todos" ? "= Cobrado en el período" : `= Total ${MEDIOS_PAGO[filtro]}`}</span>
        <span>{clp(subtotal)}</span>
      </div>
    </div>
  );
}
