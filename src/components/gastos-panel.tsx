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
type Fila={id:string;nombre:string;fecha:string;vendido:number;cobrado:number;utilidad:number;costo:number;atendidos:number;pares:number;costoFidesActual:number|null;costoFidesNota:string|null;
  costos:{clave:string;titulo:string;total:number;pagado:number}[];importes:Record<string,number>;costoMarco:number};
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
  const costos=filas.flatMap(o=>o.costos.filter(c=>c.total>0||c.pagado>0).map(c=>({...c,op:o})));
  const pendientes=costos.filter(c=>c.total>c.pagado);
  const totalPendiente=pendientes.reduce((total,c)=>total+(c.total-c.pagado),0);
  const visibles=pendientes.filter(c=>`${c.titulo} ${c.op.nombre}`.toLowerCase().includes(busqueda.toLowerCase()));
  const paginas=Math.max(1,Math.ceil(visibles.length/20)),actual=Math.min(pagina,paginas-1);
  const candidatos=gastos.filter(g=>!gastosSii.includes(g.id)&&!g.descripcion.startsWith('SII F29 · ')).map(g=>({...g,disponible:disponibleDeGasto(g,asignaciones)})).filter(g=>g.disponible>0);
  const fuente=candidatos.find(g=>g.id===gastoId);
  const vinculados=asignaciones.filter(a=>!a.anulado_en&&filas.some(o=>o.id===a.operativo_id));
  return <div className="space-y-4">
    {!historial&&<section className="overflow-hidden rounded-2xl bg-white shadow-sm" aria-label="Listado de gastos">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-tinta/10 p-4 sm:p-5">
        <h2 className="text-lg font-bold">Costos por pagar</h2>
        <strong className="ml-auto tabular-nums text-accent-dark">{clp(totalPendiente)}</strong>
        {pendientes.length>8&&<label className="block sm:w-64"><span className="sr-only">Buscar gasto o sede</span><input type="search" className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm" value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(0);}} placeholder="Buscar gasto o sede"/></label>}
      </div>
      {error&&<p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {vinculo&&<form id="vincular-pago" className="m-4 space-y-3 rounded-xl border-2 border-accent bg-sky-50 p-4" onSubmit={e=>{e.preventDefault();iniciar(async()=>{setError('');try {const r=await vincularGasto({id:vinculo.id,gastoId,operativoId:vinculo.op,clave:vinculo.clave,monto:Number(monto)});if(r.error)setError(r.error);else{setVinculo(null);router.refresh();}}catch{setError('No se pudo confirmar la vinculación. Recarga y revisa antes de reintentar.');}});}}>
        <h3 className="font-bold">Usar un pago registrado</h3><p className="text-sm text-tinta-suave">Asigna un gasto existente sin descontarlo otra vez de caja.</p>
        {candidatos.length===0&&<p className="text-sm">No hay pagos disponibles para vincular.</p>}
        <label className="block text-sm">Elegir gasto<select className={campo} required value={gastoId} onChange={e=>{setGastoId(e.target.value);setMonto('');}}><option value="">Seleccionar</option>{candidatos.map(g=><option key={g.id} value={g.id}>{g.fecha} · {g.descripcion} · disponible {clp(g.disponible)}</option>)}</select></label>
        {fuente&&<label className="block text-sm">Monto a asignar<input className={campo} type="number" min={1} max={Math.min(fuente.disponible,Math.max(0,vinculo.total-vinculo.pagado))} step={1} required value={monto} onChange={e=>setMonto(e.target.value)}/></label>}
        <div className="flex flex-wrap gap-2"><button disabled={ocupado||!fuente} className="rounded-xl bg-accent-dark px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{ocupado?'Guardando…':'Vincular pago'}</button><button type="button" disabled={ocupado} onClick={()=>setVinculo(null)} className="rounded-xl border bg-white px-4 py-3 text-sm">Cancelar</button></div>
      </form>}
      <div className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem] gap-4 bg-crema/50 px-5 py-3 text-sm text-tinta-suave sm:grid"><span>Gasto / sede</span><span className="text-right">Pendiente</span><span className="text-right">Acción</span></div>
      {visibles.length===0&&<div className="px-5 py-10 text-center"><p className="font-semibold">{busqueda?'Sin resultados':'Sin costos pendientes'}</p></div>}
      <ul className="divide-y divide-tinta/10">{visibles.slice(actual*20,actual*20+20).map(c=>{
        const id=`${c.op.id}:${c.clave}`;
        const abierto=pagoAbierto===id;
        const pendiente=Math.max(0,c.total-c.pagado);
        return <li key={id} className="p-4 sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_8rem_7rem] sm:gap-4">
            <div className="min-w-0"><h3 className="font-semibold">{c.clave==='marcos'?'Marcos':c.titulo}</h3><p className="mt-1 break-words text-sm text-tinta-suave">{c.op.nombre} · {fechaLegible(c.op.fecha)}</p></div>
            <div className="text-right"><span className="block text-sm text-tinta-suave sm:hidden">Pendiente</span><strong className={`tabular-nums text-tinta`}>{clp(pendiente)}</strong></div>
            <div className="col-span-2 flex justify-end sm:col-span-1"><button aria-expanded={abierto} aria-controls={`pago-${id}`} className={`min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold ${abierto?'border bg-white':'bg-accent-dark text-white'}`} onClick={()=>setPagoAbierto(abierto?null:id)}>{abierto?'Cerrar':'Pagar'}</button></div>
          </div>
          {abierto&&<div id={`pago-${id}`} className="mt-4 space-y-3 rounded-xl bg-crema p-3">
            <ul><PagoCostoOperativo operativoId={c.op.id} clave={c.clave as ClaveCosto|'fides'|'marcos'} titulo={c.titulo} total={c.total} pagado={c.pagado} costoFidesActual={c.op.costoFidesActual} hoy={hoy}/></ul>
            <button disabled={ocupado} onClick={()=>{setError('');setVinculo({id:crypto.randomUUID(),op:c.op.id,clave:c.clave,total:c.total,pagado:c.pagado});setGastoId('');setMonto('');window.scrollTo({top:0,behavior:'smooth'});}} className="min-h-11 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Ya lo pagué: usar un gasto registrado</button>
          </div>}
          <details className="mt-2 text-sm text-tinta-suave"><summary className="w-fit cursor-pointer py-1">Detalle del costo</summary><dl className="mt-2 flex flex-wrap gap-x-6 gap-y-2"><div><dt>Total</dt><dd className="font-semibold text-tinta">{clp(c.total)}</dd></div><div><dt>Pagado</dt><dd className="font-semibold text-tinta">{clp(c.pagado)}</dd></div><div><dt>Pendiente</dt><dd className="font-semibold text-tinta">{clp(pendiente)}</dd></div></dl>{c.clave==='marcos'&&<p className="mt-2">{c.titulo}</p>}</details>
        </li>;
      })}</ul>
      {paginas>1&&<nav aria-label="Páginas de gastos" className="flex items-center justify-between border-t border-tinta/10 p-4 text-sm"><button className="min-h-11 rounded-xl border px-3 py-2 disabled:opacity-40" disabled={actual===0} onClick={()=>setPagina(actual-1)}>Anterior</button><span>{actual+1} de {paginas}</span><button className="min-h-11 rounded-xl border px-3 py-2 disabled:opacity-40" disabled={actual===paginas-1} onClick={()=>setPagina(actual+1)}>Siguiente</button></nav>}
    </section>}
    {!historial&&<details id="costos" className="scroll-mt-6 rounded-2xl bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-semibold">Editar costos por sede <span className="ml-1 text-sm font-normal text-tinta-suave">({filas.length})</span></summary>
      <div className="mt-4 space-y-3">{filas.map(o=><details key={o.id} open={enfocarSede} className="rounded-xl border border-tinta/15 p-4"><summary className="cursor-pointer font-semibold"><span className="break-words">{o.nombre}</span><span className="mt-1 block text-sm font-normal text-tinta-suave">{fechaLegible(o.fecha)} · resultado {clp(o.utilidad)}</span></summary>
        <dl className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Ventas',clp(o.vendido)],['Cobrado',clp(o.cobrado)],['Costos',clp(o.costo)],['Atendidos',String(o.atendidos)]].map(([titulo,valor])=><div key={titulo} className="rounded-lg bg-crema p-3"><dt className="text-sm text-tinta-suave">{titulo}</dt><dd className="font-semibold tabular-nums">{valor}</dd></div>)}</dl>
        <p className="mb-4 text-sm text-tinta-suave">{o.pares} anteojos · costo por atención {o.atendidos?clp(o.costo/o.atendidos):'sin atenciones'} · resultado por atención {o.atendidos?clp(o.utilidad/o.atendidos):'sin atenciones'}.</p>
        <FormularioAgenda accion={actualizarJornada} etiqueta="Guardar costos"><input name="id" type="hidden" value={o.id}/><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{COSTOS.map(c=><label key={c.clave} className="text-sm">{c.titulo}<input className={campo} name={c.clave} type="number" min={0} max={999999999} step={1} defaultValue={o.importes[c.clave]}/></label>)}<label className="text-sm">Costo por marco vendido<input className={campo} name="costo_marco_unitario" type="number" min={0} max={999999999} step={1} defaultValue={o.costoMarco}/></label></div></FormularioAgenda>
        <div className="mt-3"><CostoFidesEditor operativoId={o.id} actual={o.costoFidesActual} nota={o.costoFidesNota} /></div>
        <p className="mt-3 text-sm text-tinta-suave">Ingresa el costo completo, pagado o pendiente. No repitas comida ni hospedaje dentro de viáticos.</p>
      </details>)}{filas.length===0&&<p className="text-sm text-tinta-suave">No hay sedes en el período seleccionado.</p>}</div>
    </details>}
    {historial&&error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {historial&&vinculados.length>0&&<details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"><summary className="cursor-pointer font-semibold">Pagos vinculados <span className="ml-1 text-sm font-normal text-tinta-suave">({vinculados.length})</span></summary>
      {vinculados.map(a=><div key={a.id} className="mt-3 border-t border-tinta/10 pt-3 text-sm"><p className="font-medium">{gastos.find(g=>g.id===a.gasto_id)?.descripcion}</p><p className="mt-1 text-tinta-suave">{filas.find(o=>o.id===a.operativo_id)?.nombre} · {a.clave} · {clp(a.monto)}</p><button disabled={ocupado} onClick={()=>iniciar(async()=>{try{const r=await deshacerVinculo(a.id);if(r.error)setError(r.error);else router.refresh();}catch{setError('No se pudo deshacer. Recarga y revisa.');}})} className="mt-2 min-h-11 rounded-xl border px-3 py-2 disabled:opacity-50">Desvincular pago</button></div>)}
      <p className="mt-3 text-sm text-tinta-suave">Desvincular conserva el gasto original.</p>
    </details>}
  </div>;
}
