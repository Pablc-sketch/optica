"use client";

import { useId } from "react";
// Sugerencias basadas en las capas DPA del MINVU y MOP (consulta 17-11-2026).
// https://geoide.minvu.cl/server2/rest/services/INFORMACION_EXTERNA/DPA/FeatureServer/5
// https://rest-sit.mop.gob.cl/arcgis/rest/services/INTEROP/SERVICIO_DPA/MapServer/1
import comunas from "@/lib/comunas-chile.json";
import { comoLlegar, mapaUbicacion } from "@/lib/mapas";

export default function UbicacionOperativo({ direccion, comuna, region, cambiar }: {
  direccion: string; comuna: string; region: string;
  cambiar: (datos: { direccion?: string; comuna?: string; region?: string }) => void;
}) {
  const lista = useId();
  const lugar = { direccion, comuna, region };
  const mapa = mapaUbicacion(lugar);
  const ruta = comoLlegar(lugar);
  const campo = "mt-1 w-full min-w-0 rounded-xl border bg-white px-2.5 py-2.5 text-base";
  return <fieldset className="grid min-w-0 gap-3 rounded-xl bg-crema p-3">
    <legend className="px-1 text-sm font-bold">Ubicación</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Comuna
        <input name="comuna" value={comuna} list={lista} placeholder="Busca, por ejemplo, Quilicura" maxLength={80} autoComplete="off" className={campo}
          onChange={e => {
            const valor = e.target.value;
            const encontrada = comunas.find(c => c.nombre.toLocaleLowerCase("es") === valor.toLocaleLowerCase("es"));
            cambiar({ comuna: valor, region: encontrada?.region ?? "" });
          }} />
        <datalist id={lista}>{comunas.map(c => <option key={`${c.nombre}-${c.region}`} value={c.nombre}>{c.region}</option>)}</datalist>
      </label>
      <label className="text-sm font-medium">Región<input name="region" value={region} onChange={e => cambiar({ region: e.target.value })} maxLength={100} placeholder="Se completa al elegir la comuna" className={campo} /></label>
    </div>
    <label className="text-sm font-medium">Dirección o nombre de la sede<input name="direccion" value={direccion} onChange={e => cambiar({ direccion: e.target.value })} maxLength={250} placeholder="Calle, número o sede vecinal" className={campo} /></label>
    {mapa && ruta ? <div className="flex flex-wrap gap-2 text-sm font-bold">
      <a href={mapa} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-3 text-brand-dark">Buscar en mapa ↗</a>
      <a href={ruta} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-white px-4 py-3 text-brand-dark">Cómo llegar ↗</a>
    </div> : <p className="text-xs text-tinta-suave">Escribe una comuna o dirección para buscarla en Google Maps.</p>}
    {comuna && !direccion && <p className="text-xs text-tinta-suave">El mapa buscará la comuna. Agrega la dirección para llegar a la sede exacta.</p>}
  </fieldset>;
}
