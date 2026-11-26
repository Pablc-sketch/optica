"use client";

import { useActionState } from "react";
import { guardarCompraMarcos, type EstadoCompraMarcos } from "@/lib/actions/compra-marcos";

const inicial: EstadoCompraMarcos = { ok: false, mensaje: "" };

export default function AnotarCompra({ fila }: {
  fila: { clave: string; revision: string; codigo: string; enMano: number | null; stock: number | null; porComprar: number | null; comprado: boolean };
}) {
  const [estado, guardar, enviando] = useActionState(guardarCompraMarcos, inicial);
  return <form action={guardar} className="mt-3 flex flex-wrap items-end gap-3">
    <input type="hidden" name="clave" value={fila.clave} />
    <input type="hidden" name="revision" value={fila.revision} />
    <input type="hidden" name="por_comprar" value={fila.porComprar ?? ""} />
    {fila.stock === null && (
      <label className="grid gap-1 text-sm font-semibold">
        En mano
        <input className="w-28 rounded-lg border bg-white px-2 py-1.5 text-base tabular-nums" aria-label={`En mano para ${fila.codigo}`}
          type="number" inputMode="numeric" min={0} step={1} name="en_mano" defaultValue={fila.enMano ?? ""} placeholder="Sin contar" />
      </label>
    )}
    {fila.porComprar !== 0 && <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
      <input type="checkbox" name="comprado" aria-label={`Comprado ${fila.codigo}`} defaultChecked={fila.comprado} />
      Comprado
    </label>}
    <button type="submit" disabled={enviando}
      className="min-h-9 rounded-lg border border-tinta/20 bg-white px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-crema disabled:opacity-50">
      {enviando ? "Guardando…" : "Guardar"}
    </button>
    {estado.mensaje && <span role="status" className={`text-sm ${estado.ok ? "text-emerald-800" : "text-red-700"}`}>{estado.mensaje}</span>}
  </form>;
}
