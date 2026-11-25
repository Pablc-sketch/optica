"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { guardarChequeo } from "@/lib/actions/chequeos";
import { fechaLegible } from "@/lib/fechas";
import type { Chequeo, SedeChequeo } from "@/lib/chequeos";

type Sede = Pick<SedeChequeo, "id" | "nombre" | "fecha" | "fecha_fin" | "direccion" | "chequeo_id">;
const campo = "block w-full rounded-lg border border-tinta/20 bg-white px-3 py-2.5 text-base";

export default function FormularioChequeo({ chequeo, sedes, hoy }: { chequeo?: Chequeo; sedes: Sede[]; hoy: string }) {
  const [error, enviar, guardando] = useActionState(guardarChequeo, "");
  const [desde, setDesde] = useState(chequeo?.desde ?? hoy);
  const [hasta, setHasta] = useState(chequeo?.hasta ?? hoy);
  const [elegidas, setElegidas] = useState(new Set(sedes.filter(s => chequeo && s.chequeo_id === chequeo.id).map(s => s.id)));
  const visibles = sedes.filter(s => s.fecha >= desde && (s.fecha_fin ?? s.fecha) <= hasta);
  const cuenta = visibles.filter(s => elegidas.has(s.id)).length;
  return (
    <form action={enviar} className="grid gap-4 rounded-xl bg-white p-4 shadow-sm sm:p-6">
      {chequeo && <input type="hidden" name="id" value={chequeo.id} />}
      <label className="space-y-1 text-sm font-semibold">Nombre del chequeo
        <input name="nombre" defaultValue={chequeo?.nombre} required maxLength={100} placeholder="Ej. Chequeo del 23-11 al 28-11" className={campo} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-sm font-semibold">Desde
          <input name="desde" type="date" value={desde} onChange={evento => setDesde(evento.target.value)} required className={campo} />
        </label>
        <label className="space-y-1 text-sm font-semibold">Hasta
          <input name="hasta" type="date" value={hasta} min={desde} onChange={evento => setHasta(evento.target.value)} required className={campo} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="font-semibold">Sedes del chequeo <span className="font-normal text-tinta-suave">· {cuenta} seleccionadas</span></legend>
        {visibles.length === 0 && <p className="rounded-lg bg-crema p-3 text-sm">No hay sedes disponibles en estas fechas.</p>}
        {visibles.map(s => (
          <label key={s.id} className="flex items-center gap-3 rounded-lg border border-tinta/15 p-3 has-checked:border-brand has-checked:bg-sky-50">
            <input type="checkbox" name="sede" value={s.id} checked={elegidas.has(s.id)} className="size-5 accent-brand"
              onChange={evento => {
                const marcada = evento.target.checked;
                setElegidas(previas => {
                  const siguientes = new Set(previas);
                  if (marcada) siguientes.add(s.id);
                  else siguientes.delete(s.id);
                  return siguientes;
                });
              }} />
            <span><b>{s.nombre}</b><span className="block text-sm text-tinta-suave">{fechaLegible(s.fecha)}{s.direccion ? ` · ${s.direccion}` : ""}</span></span>
          </label>
        ))}
      </fieldset>
      <label className="space-y-1 text-sm font-semibold">Ahorro del chequeo (%)
        <input name="ahorro_pct" type="number" min={0} max={100} step="any" required defaultValue={chequeo?.ahorro_pct ?? 20} className={campo} />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-900">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button disabled={guardando} className="rounded-lg bg-sidebar px-4 py-3 font-semibold text-white disabled:opacity-50">
          {guardando ? "Guardando…" : "Guardar chequeo"}
        </button>
        <Link href={chequeo ? `/operativos/chequeos?chequeo=${chequeo.id}` : "/operativos/chequeos"} className="rounded-lg bg-crema px-4 py-3 font-semibold">Cancelar</Link>
      </div>
    </form>
  );
}
