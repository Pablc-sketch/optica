'use client';
import { useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PagoCostoOperativo from './pago-costo-operativo';
import CostoFidesEditor from './costo-fides-editor';
import FormularioAgenda from './formulario-agenda';
import { actualizarJornada } from '@/lib/actions/agenda-terreno';
import { vincularGasto,deshacerVinculo } from '@/lib/actions/gastos-asignaciones';
import { COSTOS, disponibleDeGasto, type AsignacionCosto, type ClaveCosto } from '@/lib/pagos-operativo';
import { fechaLegible } from '@/lib/fechas';
import { clp } from '@/lib/clp';

type Gasto={id:string;fecha:string;descripcion:string;monto:number;categoria:string;caja:string;operativo_id:string|null};
type Costo = { clave: ClaveCosto | 'fides' | 'marcos'; titulo: string; total: number; pagado: number };
type Fila = {
  id: string; nombre: string; fecha: string; archivado: boolean; pares: number; costoMarco: number;
  costoFidesActual: number | null; costoFidesNota: string | null; costos: Costo[];
  importes: Record<string, number>;
};
const campo='mt-1 w-full rounded-xl border bg-white p-3';
export default function GastosPanel({filas,gastos,asignaciones,hoy,gastosSii=[],historial=false,enfocarSede=false}:{filas:Fila[];gastos:Gasto[];asignaciones:AsignacionCosto[];hoy:string;gastosSii?:string[];historial?:boolean;enfocarSede?:boolean}) {
  const [pagoAbierto,setPagoAbierto]=useState<string|null>(null);
  const [busqueda,setBusqueda]=useState('');
  const [pagina,setPagina]=useState(0);
  const router=useRouter();
  const [ocupado,iniciar]=useTransition();
  const [error,setError]=useState('');
  const [vinculo,setVinculo]=useState<{id:string;op:string;clave:string;total:number;pagado:number}|null>(null);
  const [gastoId,setGastoId]=useState('');
  const [monto,setMonto]=useState('');
  const sedes = filas.flatMap(sede => {
    const costos = sede.costos.filter(c => c.total > c.pagado);
    if (!costos.length) return [];
    return [{ sede, costos, saldo: costos.reduce((total, c) => total + c.total - c.pagado, 0) }];
  });
  const termino = busqueda.trim().toLocaleLowerCase('es-CL');
  const visibles = sedes.flatMap(grupo => {
    const costos = grupo.costos.filter(c => `${grupo.sede.nombre} ${c.titulo}`.toLocaleLowerCase('es-CL').includes(termino));
    return costos.length ? [{ ...grupo, costos }] : [];
  });
  const totalPendiente = sedes.reduce((total, grupo) => total + grupo.saldo, 0);
  const paginas = Math.max(1, Math.ceil(visibles.length / 10));
  const actual = Math.min(pagina, paginas - 1);
  const editar = filas.filter(o => enfocarSede || !o.archivado || o.costos.some(c => c.total > c.pagado));
  const candidatos=gastos.filter(g=>!gastosSii.includes(g.id)&&!g.descripcion.startsWith('SII F29 · ')).map(g=>({...g,disponible:disponibleDeGasto(g,asignaciones)})).filter(g=>g.disponible>0);
  const fuente=candidatos.find(g=>g.id===gastoId);
  const vinculados=asignaciones.filter(a=>!a.anulado_en&&filas.some(o=>o.id===a.operativo_id));
  return <div className="space-y-4">
    {!historial&&<section className="overflow-hidden rounded-2xl bg-white shadow-sm" aria-label="Listado de gastos">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tinta/10 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Costos por pagar</h2>
        <strong className="ml-auto tabular-nums text-accent-dark">{clp(totalPendiente)}</strong>
        {sedes.length>3&&<label className="block sm:w-64"><span className="sr-only">Buscar costo o sede</span><input type="search" className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm" value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(0);}} placeholder="Buscar costo o sede"/></label>}
      </div>
      {error&&<p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {vinculo&&<form id="vincular-pago" className="m-4 space-y-3 rounded-xl border-2 border-accent bg-sky-50 p-4" onSubmit={e=>{e.preventDefault();iniciar(async()=>{setError('');try {const r=await vincularGasto({id:vinculo.id,gastoId,operativoId:vinculo.op,clave:vinculo.clave,monto:Number(monto)});if(r.error)setError(r.error);else{setVinculo(null);router.refresh();}}catch{setError('No se pudo confirmar la vinculación. Recarga y revisa antes de reintentar.');}});}}>
        <h3 className="font-bold">Usar un pago registrado</h3><p className="text-sm text-tinta-suave">Asigna un gasto existente sin descontarlo otra vez de caja.</p>
        {candidatos.length===0&&<p className="text-sm">No hay pagos disponibles para vincular.</p>}
        <label className="block text-sm">Elegir gasto<select className={campo} required value={gastoId} onChange={e=>{setGastoId(e.target.value);setMonto('');}}><option value="">Seleccionar</option>{candidatos.map(g=><option key={g.id} value={g.id}>{g.fecha} · {g.descripcion} · disponible {clp(g.disponible)}</option>)}</select></label>
        {fuente&&<label className="block text-sm">Monto a asignar<input className={campo} type="number" min={1} max={Math.min(fuente.disponible,Math.max(0,vinculo.total-vinculo.pagado))} step={1} required value={monto} onChange={e=>setMonto(e.target.value)}/></label>}
        <div className="flex flex-wrap gap-2"><button disabled={ocupado||!fuente} className="rounded-xl bg-accent-dark px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{ocupado?'Guardando…':'Vincular pago'}</button><button type="button" disabled={ocupado} onClick={()=>setVinculo(null)} className="rounded-xl border bg-white px-4 py-3 text-sm">Cancelar</button></div>
      </form>}
      {visibles.length===0&&<p className="px-5 py-8 text-center text-sm text-tinta-suave">{termino?'Sin resultados':'Sin costos pendientes'}</p>}
      {visibles.slice(actual*10,actual*10+10).map(({ sede, costos, saldo }) => <section key={sede.id} className="border-b border-tinta/10 last:border-0">
        <header className="flex flex-wrap items-baseline justify-between gap-2 bg-crema/60 px-4 py-3 sm:px-5">
          <div><h3 className="font-bold">{sede.nombre}</h3><p className="text-sm text-tinta-suave">{fechaLegible(sede.fecha)}{sede.archivado && ' · Archivado'}</p></div>
          <p className="text-sm">Por pagar <strong className="ml-1 tabular-nums">{clp(saldo)}</strong></p>
        </header>
        <ul className="divide-y divide-tinta/10">{costos.map(c => {
          const id = `${sede.id}:${c.clave}`;
          const abierto = pagoAbierto === id;
          return <li key={id} className="px-4 py-3 sm:px-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,2fr)_auto] lg:items-center">
              <div>
                <h4 className="font-semibold">{c.titulo}</h4>
                {c.clave==='fides'&&<p className="text-xs text-tinta-suave">{sede.costoFidesActual===null?'Estimado según ventas':'Costo ingresado de Fides'}</p>}
                {c.clave==='marcos'&&<p className="text-xs text-tinta-suave">{sede.pares} × {clp(sede.costoMarco)} por marco</p>}
              </div>
              <dl className="col-span-2 row-start-2 grid grid-cols-3 gap-2 text-sm lg:col-span-1 lg:row-auto">
                <div><dt className="text-xs text-tinta-suave">Costo total</dt><dd className="font-medium tabular-nums">{clp(c.total)}</dd></div>
                <div><dt className="text-xs text-tinta-suave">Pagado</dt><dd className="font-medium tabular-nums">{clp(c.pagado)}</dd></div>
                <div><dt className="text-xs text-tinta-suave">Falta pagar</dt><dd className="font-bold tabular-nums text-accent-dark">{clp(c.total-c.pagado)}</dd></div>
              </dl>
              <button aria-expanded={abierto} aria-controls={abierto?`pago-${id}`:undefined}
                className={`min-h-11 rounded-xl px-3 py-2 text-sm font-semibold ${abierto?'border bg-white':'bg-accent-dark text-white'}`}
                onClick={()=>setPagoAbierto(abierto?null:id)}>{abierto?'Cerrar':'Pagar'}</button>
            </div>
            {abierto&&<div id={`pago-${id}`} className="mt-3 space-y-3 rounded-xl bg-crema p-3">
              <ul><PagoCostoOperativo operativoId={sede.id} clave={c.clave} titulo={c.titulo} total={c.total} pagado={c.pagado} costoFidesActual={sede.costoFidesActual} hoy={hoy}/></ul>
              <button disabled={ocupado} onClick={()=>{setError('');setVinculo({id:crypto.randomUUID(),op:sede.id,clave:c.clave,total:c.total,pagado:c.pagado});setGastoId('');setMonto('');window.scrollTo({top:0,behavior:'smooth'});}} className="min-h-11 rounded-xl border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50">Usar un gasto ya registrado</button>
            </div>}
          </li>;
        })}</ul>
      </section>)}
      {paginas>1&&<nav aria-label="Páginas de gastos" className="flex items-center justify-between border-t border-tinta/10 p-4 text-sm"><button className="min-h-11 rounded-xl border px-3 py-2 disabled:opacity-40" disabled={actual===0} onClick={()=>setPagina(actual-1)}>Anterior</button><span>{actual+1} de {paginas}</span><button className="min-h-11 rounded-xl border px-3 py-2 disabled:opacity-40" disabled={actual===paginas-1} onClick={()=>setPagina(actual+1)}>Siguiente</button></nav>}
    </section>}
    {!historial&&editar.length>0&&<details id="costos" className="scroll-mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-semibold">Editar costos por sede</summary>
      <div className="mt-4 space-y-3">{editar.map(o=><details key={o.id} open={enfocarSede} className="rounded-xl border border-tinta/15 p-4"><summary className="cursor-pointer font-semibold"><span className="break-words">{o.nombre}</span><span className="mt-1 block text-sm font-normal text-tinta-suave">{fechaLegible(o.fecha)}{o.archivado&&' · Archivado'}</span></summary>
        <p className="my-3 text-sm text-tinta-suave">Anota el costo completo. Los pagos se registran arriba.</p>
        <FormularioAgenda accion={actualizarJornada} etiqueta="Guardar costos"><input name="id" type="hidden" value={o.id}/><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{COSTOS.map(c=><label key={c.clave} className="text-sm">{c.titulo}<input className={campo} name={c.clave} type="number" min={0} max={999999999} step={1} defaultValue={o.importes[c.clave]}/></label>)}<label className="text-sm">Costo por marco vendido<input className={campo} name="costo_marco_unitario" type="number" min={0} max={999999999} step={1} defaultValue={o.costoMarco}/></label></div></FormularioAgenda>
        <div className="mt-3"><CostoFidesEditor operativoId={o.id} actual={o.costoFidesActual} nota={o.costoFidesNota} /></div>
        <p className="mt-3 text-sm text-tinta-suave">Si comida u hospedaje se anotan por separado, exclúyelos de viáticos.</p>
      </details>)}</div>
    </details>}
    {historial&&error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {historial&&vinculados.length>0&&<details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-semibold">Pagos vinculados <span className="ml-1 text-sm font-normal text-tinta-suave">({vinculados.length})</span></summary>
      {vinculados.map(a=><div key={a.id} className="mt-3 border-t border-tinta/10 pt-3 text-sm"><p className="font-medium">{gastos.find(g=>g.id===a.gasto_id)?.descripcion}</p><p className="mt-1 text-tinta-suave">{filas.find(o=>o.id===a.operativo_id)?.nombre} · {filas.find(o=>o.id===a.operativo_id)?.costos.find(c=>c.clave===a.clave)?.titulo ?? a.clave} · {clp(a.monto)}</p><button disabled={ocupado} onClick={()=>iniciar(async()=>{try{const r=await deshacerVinculo(a.id);if(r.error)setError(r.error);else router.refresh();}catch{setError('No se pudo deshacer. Recarga y revisa.');}})} className="mt-2 min-h-11 rounded-xl border px-3 py-2 disabled:opacity-50">Desvincular pago</button></div>)}
      <p className="mt-3 text-sm text-tinta-suave">Desvincular conserva el gasto original.</p>
    </details>}
  </div>;
}
