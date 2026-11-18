'use client';
import Link from 'next/link';
import { useState,useTransition } from 'react';
import { useRouter } from 'next/navigation';
import PagoCostoOperativo from './pago-costo-operativo';
import FormularioAgenda from './formulario-agenda';
import { actualizarJornada } from '@/lib/actions/agenda-terreno';
import { vincularGasto,deshacerVinculo } from '@/lib/actions/gastos-asignaciones';
import { COSTOS, disponibleDeGasto, type AsignacionCosto, type ClaveCosto } from '@/lib/pagos-operativo';
import { clp } from '@/lib/clp';

type Gasto={id:string;fecha:string;descripcion:string;monto:number;categoria:string;caja:string;operativo_id:string|null};
type Fila={id:string;nombre:string;fecha:string;vendido:number;cobrado:number;utilidad:number;costo:number;atendidos:number;pares:number;costoFidesActual:number|null;
  costos:{clave:string;titulo:string;total:number;pagado:number}[];importes:Record<string,number>;costoMarco:number};
const campo='mt-1 w-full rounded-xl border bg-white p-3';
export default function GastosPanel({filas,gastos,asignaciones,hoy,generales,gastosSii=[]}:{filas:Fila[];gastos:Gasto[];asignaciones:AsignacionCosto[];hoy:string;generales:Gasto[];gastosSii?:string[]}) {
  const [vista,setVista]=useState('pendientes');
  const [busqueda,setBusqueda]=useState('');
  const [pagina,setPagina]=useState(0);
  const router=useRouter();
  const [ocupado,iniciar]=useTransition();
  const [error,setError]=useState('');
  const [vinculo,setVinculo]=useState<{id:string;op:string;clave:string;total:number;pagado:number}|null>(null);
  const [gastoId,setGastoId]=useState('');
  const [monto,setMonto]=useState('');
  const costos=filas.flatMap(o=>o.costos.filter(c=>c.total>0||c.pagado>0).map(c=>({...c,op:o})));
  const pendientes=costos.filter(c=>c.total>c.pagado),pagados=costos.filter(c=>c.pagado>=c.total);
  const visibles=costos.filter(c=>(vista==='pendientes'?c.total>c.pagado:vista==='pagados'?c.pagado>=c.total:true)&&`${c.titulo} ${c.op.nombre}`.toLowerCase().includes(busqueda.toLowerCase()));
  const paginas=Math.max(1,Math.ceil(visibles.length/20)),actual=Math.min(pagina,paginas-1);
  const candidatos=gastos.filter(g=>!gastosSii.includes(g.id)&&!g.descripcion.startsWith('SII F29 · ')).map(g=>({...g,disponible:disponibleDeGasto(g,asignaciones)})).filter(g=>g.disponible>0);
  const fuente=candidatos.find(g=>g.id===gastoId);
  return <>
    <nav className="flex flex-wrap gap-2" aria-label="Estado de los gastos">{[['pendientes',`Pendientes (${pendientes.length})`],['pagados',`Pagados (${pagados.length})`],['todos','Todos']].map(([v,n])=><button key={v} onClick={()=>{setVista(v);setPagina(0);}} aria-pressed={vista===v} className={`rounded-xl px-4 py-3 font-semibold ${vista===v?'bg-emerald-800 text-white':'bg-white'}`}>{n}</button>)}</nav>
    <p className="text-lg font-bold">Por saldar: {clp(pendientes.reduce((s,c)=>s+Math.max(0,c.total-c.pagado),0))}</p>
    <label className="block text-sm">Buscar gasto o sede<input className={campo} value={busqueda} onChange={e=>{setBusqueda(e.target.value);setPagina(0);}} placeholder="Marcos, equipos, Longotoma…"/></label>
    <p className="text-sm text-tinta-suave">Si ya lo pagaste, vincula un gasto existente. Si faltaba anotarlo, registra el pago con su fecha real.</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {vinculo&&<form className="space-y-3 rounded-2xl border-2 border-brand bg-white p-4" onSubmit={e=>{e.preventDefault();iniciar(async()=>{setError('');try {const r=await vincularGasto({id:vinculo.id,gastoId,operativoId:vinculo.op,clave:vinculo.clave,monto:Number(monto)});if(r.error)setError(r.error);else{setVinculo(null);router.refresh();}}catch{setError('No se pudo confirmar la vinculación. Recarga y revisa antes de reintentar.');}});}}>
      <h2 className="font-bold">Vincular un pago ya registrado</h2><p className="text-sm">No vuelve a salir dinero de caja. Puedes repartir una compra de marcos entre varias sedes.</p>
      <label className="block text-sm">Gasto pagado<select className={campo} required value={gastoId} onChange={e=>{setGastoId(e.target.value);setMonto('');}}><option value="">Elegir gasto</option>{candidatos.map(g=><option key={g.id} value={g.id}>{g.fecha} · {g.descripcion} · disponible {clp(g.disponible)}</option>)}</select></label>
      {fuente&&<label className="block text-sm">Monto de este gasto que cubre este costo<input className={campo} type="number" min={1} max={Math.min(fuente.disponible,Math.max(0,vinculo.total-vinculo.pagado))} step={1} required value={monto} onChange={e=>setMonto(e.target.value)}/></label>}
      <div className="flex gap-2"><button disabled={ocupado||!fuente} className="rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-50">{ocupado?'Guardando…':'Vincular sin duplicar gasto'}</button><button type="button" disabled={ocupado} onClick={()=>setVinculo(null)} className="rounded-xl border px-4 py-3">Cancelar</button></div>
    </form>}
    {visibles.length===0&&<p className="rounded-xl bg-emerald-50 p-4">No hay gastos con este filtro. Los operativos con costos $0 aparecen abajo para completarlos.</p>}
    <ul className="space-y-3">{visibles.slice(actual*20,actual*20+20).map(c=><li key={`${c.op.id}:${c.clave}`} className="rounded-2xl border border-tinta/10 p-3">
      <Link href={`/operativos/${c.op.id}/cierre#costos`} className="mb-2 block font-semibold underline">{c.op.nombre} · {c.op.fecha}</Link>
      <ul><PagoCostoOperativo operativoId={c.op.id} clave={c.clave as ClaveCosto|'fides'|'marcos'} titulo={c.titulo} total={c.total} pagado={c.pagado} costoFidesActual={c.op.costoFidesActual} hoy={hoy}/></ul>
      {c.total>c.pagado&&<button disabled={ocupado} onClick={()=>{setError('');setVinculo({id:crypto.randomUUID(),op:c.op.id,clave:c.clave,total:c.total,pagado:c.pagado});setGastoId('');setMonto('');window.scrollTo({top:0,behavior:'smooth'});}} className="mt-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold">Ya lo pagué: vincular gasto existente</button>}
      {c.pagado>c.total&&<p className="mt-2 text-sm text-amber-900">Pago superior al costo: {clp(c.pagado-c.total)}. Revisa el registro o el costo.</p>}
    </li>)}</ul>
    {paginas>1&&<nav className="flex items-center justify-between"><button className="rounded-xl border p-3" disabled={actual===0} onClick={()=>setPagina(actual-1)}>Anterior</button><span>{actual+1} / {paginas}</span><button className="rounded-xl border p-3" disabled={actual===paginas-1} onClick={()=>setPagina(actual+1)}>Siguiente</button></nav>}
    <section className="space-y-3"><h2 className="text-xl font-bold">Utilidad y gastos por sede</h2>{filas.map(o=><details key={o.id} className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">{o.nombre} · {o.fecha} · utilidad {clp(o.utilidad)}</summary>
      <p className="my-3 text-sm">Ventas {clp(o.vendido)} · cobrado {clp(o.cobrado)} · costos {clp(o.costo)} · {o.atendidos} atendidos · {o.pares} anteojos. Costo por atención: {o.atendidos?clp(o.costo/o.atendidos):'sin atenciones'}. Utilidad por atención: {o.atendidos?clp(o.utilidad/o.atendidos):'sin atenciones'}.</p>
      <FormularioAgenda accion={actualizarJornada} etiqueta="Guardar costos del operativo"><input name="id" type="hidden" value={o.id}/><div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{COSTOS.map(c=><label key={c.clave} className="text-sm">{c.titulo}<input className={campo} name={c.clave} type="number" min={0} max={999999999} step={1} defaultValue={o.importes[c.clave]}/></label>)}<label className="text-sm">Costo por marco vendido<input className={campo} name="costo_marco_unitario" type="number" min={0} max={999999999} step={1} defaultValue={o.costoMarco}/></label></div></FormularioAgenda>
      <p className="mt-2 text-xs text-tinta-suave">Completa el costo total, esté pagado o pendiente. Combustible va en transporte; no repitas hospedaje o comida también dentro de viáticos.</p>
    </details>)}</section>
    <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">Gastos generales pagados · {clp(generales.reduce((s,g)=>s+g.monto,0))}</summary>
      <p className="mt-3 text-sm">Incluye compras de inventario como salida de caja. Sus marcos se cuentan en utilidad al venderlos.</p>
      <Link href="/caja?ver=movimientos#nuevo-gasto" className="my-3 inline-block rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Agregar gasto global pagado</Link>
      <div className="max-h-96 overflow-y-auto">{[...generales].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(g=><p key={g.id} className="border-t py-3 text-sm">{g.fecha} · {g.descripcion} · {clp(g.monto)} · pagado{g.caja==='personal'?' personalmente':''}</p>)}</div>
    </details>
    <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-semibold">Pagos vinculados · deshacer una asociación</summary>{asignaciones.filter(a=>!a.anulado_en&&filas.some(o=>o.id===a.operativo_id)).map(a=><div key={a.id} className="mt-3 border-t pt-3 text-sm"><p>{gastos.find(g=>g.id===a.gasto_id)?.descripcion} → {filas.find(o=>o.id===a.operativo_id)?.nombre} · {a.clave} · {clp(a.monto)}</p><button disabled={ocupado} onClick={()=>iniciar(async()=>{try{const r=await deshacerVinculo(a.id);if(r.error)setError(r.error);else router.refresh();}catch{setError('No se pudo deshacer. Recarga y revisa.');}})} className="mt-2 rounded-xl border px-3 py-2">Desvincular, conservar gasto</button></div>)}<Link href="/pagos/revisar" className="mt-4 block underline">Corregir montos, fechas o pagos anteriores →</Link></details>
  </>;
}
