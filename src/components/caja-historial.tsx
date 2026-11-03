'use client';
import Link from 'next/link';
import { useState } from 'react';
import { clp } from '@/lib/clp';
import { fechaLegible, diaEnChile } from '@/lib/fechas';
import { cajaDelPago } from '@/lib/caja';
import { salidasDeMovimiento } from '@/lib/caja-fuentes';
type Cobro = { id:string; fecha:string; monto:number; medio_pago:string|null; venta_id:string };
type Gasto = { id:string; fecha:string; monto:number; caja:string; descripcion:string };
type Retiro = { id:string; fecha:string; monto:number; caja:string; persona:string; operativo_id:string|null };
type Traslado = { id:string; fecha:string; monto:number; caja:string; tipo:string; descripcion:string };
const personas:Record<string,string> = {pablo:'Pablo',madre:'Pamela',isadora:'Isadora',ahorro:'Ahorro'};
export default function CajaHistorial({cobros,gastos,retiros,traslados}:{cobros:Cobro[];gastos:Gasto[];retiros:Retiro[];traslados:Traslado[]}) {
  const [caja,setCaja]=useState('todas');
  const [tipo,setTipo]=useState('todos');
  const [limite,setLimite]=useState(25);
  const filas=[
    ...cobros.map(c=>({id:`c-${c.id}`,fecha:diaEnChile(c.fecha),caja:cajaDelPago(c.medio_pago),monto:c.monto,titulo:c.medio_pago==='transferencia'?'Transferencia recibida':c.medio_pago==='debito'||c.medio_pago==='credito'?'Pago con máquina':!c.medio_pago?'Cobro sin medio registrado':'Cobro en efectivo',href:`/ventas/${c.venta_id}`})),
    ...gastos.map(g=>({...g,id:`g-${g.id}`,monto:-g.monto,titulo:g.descripcion,href:'/pagos/revisar'})),
    ...retiros.map(r=>({...r,id:`r-${r.id}`,monto:-r.monto,titulo:`${r.monto<0?'Aporte':r.persona==='ahorro'?'Ahorro separado':'Pago'} · ${personas[r.persona]??r.persona}`,href:'/pagos/revisar'})),
    ...traslados.flatMap(t=>{const s=salidasDeMovimiento(t);return (['efectivo','digital'] as const).filter(c=>s[c]!==0).map(c=>({id:`t-${t.id}-${c}`,fecha:t.fecha,caja:c,monto:-s[c],titulo:t.descripcion,href:'/caja'}));}),
  ].filter(m=>(caja==='todas'||m.caja===caja)&&(tipo==='todos'||(tipo==='entradas'?m.monto>0:m.monto<0)))
    .sort((a,b)=>b.fecha.localeCompare(a.fecha)||a.id.localeCompare(b.id));
  return <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Movimientos</h2>
    <div className="my-3 flex flex-wrap gap-2"><label className="text-sm">Origen<select className="ml-2 rounded-xl border p-3" value={caja} onChange={e=>{setCaja(e.target.value);setLimite(25);}}><option value="todas">Todos</option><option value="digital">Cuenta bancaria</option><option value="efectivo">Efectivo</option><option value="personal">Personal de Pablo</option></select></label><label className="text-sm">Tipo<select className="ml-2 rounded-xl border p-3" value={tipo} onChange={e=>{setTipo(e.target.value);setLimite(25);}}><option value="todos">Todos</option><option value="entradas">Entradas</option><option value="salidas">Salidas</option></select></label></div>
    <ul className="divide-y divide-tinta/10">{filas.slice(0,limite).map(m=><li key={m.id}><Link href={m.href} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><b className="block break-words text-sm">{m.titulo}</b><span className="text-xs text-tinta-suave">{fechaLegible(m.fecha)} · {m.caja==='efectivo'?'Efectivo':m.caja==='personal'?'Personal · no sale de caja':'Cuenta bancaria'}</span></span><b className={`shrink-0 tabular-nums ${m.caja==='personal'?'text-tinta-suave':m.monto<0?'text-red-700':'text-emerald-800'}`}>{m.monto>0?'+':''}{clp(m.monto)}</b></Link></li>)}</ul>
    {filas.length===0&&<p className="py-3 text-sm">Sin movimientos con estos filtros.</p>}
    {filas.length>limite&&<button className="mt-3 rounded-xl border px-4 py-3" onClick={()=>setLimite(l=>l+25)}>Ver más ({filas.length-limite})</button>}
  </section>;
}
