"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buscarDocumentosSeguro, type ResultadoSeguros } from "@/lib/actions/seguros";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, fechaLegible } from "@/lib/fechas";

export default function BuscadorSeguros() {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoSeguros | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Reembolsos</h1>
      <form
        action={() =>
          iniciar(async () => {
            setResultado(null);
            try {
              setResultado(await buscarDocumentosSeguro(texto));
            } catch {
              setResultado({ compras: [], error: "No se pudo buscar. Intenta de nuevo." });
            }
          })
        }
        className="flex gap-2"
      >
        <input
          aria-label="Nombre o RUT del paciente"
          value={texto}
          onChange={(e) => { setTexto(e.target.value); setResultado(null); }}
          disabled={pendiente}
          minLength={3}
          maxLength={80}
          required
          autoComplete="off"
          placeholder="Nombre o RUT del paciente"
          className="min-w-0 flex-1 rounded-xl border border-tinta-suave/30 bg-white px-3 py-3 text-base"
        />
        <button disabled={pendiente} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-60">
          {pendiente ? "…" : "Buscar"}
        </button>
      </form>
      <div aria-live="polite" aria-busy={pendiente}>
        {resultado?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{resultado.error}</p>}
        {resultado && !resultado.error && resultado.compras.length === 0 && <p className="p-3 text-sm">Sin compras con ese nombre o RUT.</p>}
        <ul className="flex flex-col gap-3">
          {resultado?.compras.map((compra) => (
            <li key={compra.id}>
              <Link href={`/ventas/${compra.id}/reembolso`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm hover:bg-crema">
                <span>
                  <b className="block">{compra.paciente.nombre}</b>
                  <span className="text-sm text-tinta-suave">
                    {formatearRut(compra.paciente.rut)} · {fechaLegible(diaEnChile(compra.fecha))} · {clp(compra.total)}
                  </span>
                </span>
                <span className="shrink-0 rounded-xl bg-brand px-3 py-2 font-semibold text-white">Reembolso →</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
