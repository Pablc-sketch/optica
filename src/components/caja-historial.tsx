'use client';
import Link from 'next/link';
import { useState } from 'react';
import { clp } from '@/lib/clp';
import { fechaLegible, nombreMes } from '@/lib/fechas';
import { FUENTES, celdaCsv, resumenMovimientos, type FilaFinanzas } from '@/lib/finanzas';
const tipos = { cobro:'Cobro de venta',gasto:'Gasto',sueldo:'Sueldo',retiro:'Adelanto / retiro',aporte:'Aporte',ahorro:'Ahorro',traslado:'Traslado',devolucion:'Devolución personal' } as const;
const campo = 'mt-1.5 w-full min-w-0 max-w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm';
export default function CajaHistorial({ filas, mesInicial }: { filas:FilaFinanzas[]; mesInicial:string }) {
  const [mes,setMes] = useState(mesInicial);
  const [caja,setCaja] = useState('todas');
  const [tipo,setTipo] = useState('todos');
  const [busqueda,setBusqueda] = useState('');
  const [limite,setLimite] = useState(25);
  const filtradas = filas.filter(m=>(!mes||m.fecha.startsWith(mes)) && (caja==='todas'||(caja==='personal'?m.caja==='personal':m.caja===caja||(m.tipo==='traslado'&&m[caja as 'efectivo'|'digital']!==0)))
    && (tipo==='todos'||m.tipo===tipo) && `${m.titulo} ${m.nota}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));
  const resumen = resumenMovimientos(filtradas,caja);
  function descargar() {
    const contenido = [['Fecha','Tipo','Concepto','Origen','Efecto cuenta','Efecto efectivo','Pagado personalmente','Estado','Nota'].map(celdaCsv).join(';'),
      ...filtradas.map(m=>[m.fecha,tipos[m.tipo],m.titulo,FUENTES[m.caja as keyof typeof FUENTES]??'Entre cuenta y efectivo',m.digital,m.efectivo,-m.personal,m.confirmado===null?'No aplica':m.confirmado?'Confirmado':'Por confirmar',m.nota].map(celdaCsv).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF',contenido],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=`lentia-movimientos-${mes||'historial'}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-lg font-bold text-slate-950">Movimientos</h2><p className="mt-1 text-xs text-slate-500">{mes?nombreMes(mes):'Todo el historial'} · {filtradas.length} registros</p></div><button disabled={!filtradas.length} onClick={descargar} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Descargar Excel (CSV)</button></div>
    <div className="grid gap-3 border-b border-slate-100 bg-slate-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
      <label className="min-w-0 text-xs font-semibold text-slate-600">Mes<input type="month" min="2000-01" max="2100-12" value={mes} onChange={e=>{setMes(e.target.value);setLimite(25);}} className={campo} /></label>
      <label className="min-w-0 text-xs font-semibold text-slate-600">Cuenta u origen<select value={caja} onChange={e=>{setCaja(e.target.value);setLimite(25);}} className={campo}><option value="todas">Todas las cuentas</option><option value="digital">Mercado Pago</option><option value="efectivo">Efectivo</option><option value="personal">Dinero personal de Pablo</option></select></label>
      <label className="min-w-0 text-xs font-semibold text-slate-600">Tipo de movimiento<select value={tipo} onChange={e=>{setTipo(e.target.value);setLimite(25);}} className={campo}><option value="todos">Todos los movimientos</option>{Object.entries(tipos).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label className="min-w-0 text-xs font-semibold text-slate-600">Buscar<input value={busqueda} onChange={e=>{setBusqueda(e.target.value);setLimite(25);}} placeholder="Concepto o nota" className={campo} /></label>
      {(mes||caja!=='todas'||tipo!=='todos'||busqueda) && <button onClick={()=>{setMes('');setCaja('todas');setTipo('todos');setBusqueda('');setLimite(25);}} className="justify-self-start text-xs font-semibold text-teal-900 underline">Ver todo el historial</button>}
    </div>
    <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-3">{[['Entradas registradas',resumen.entradas],['Salidas registradas',resumen.salidas],['Movimiento neto',resumen.neto]].map(([n,v])=><div key={n}><p className="text-xs text-slate-500">{n}</p><b className="mt-1 block text-xl tabular-nums text-slate-900">{clp(Number(v))}</b></div>)}</div>
    <p className="px-5 pt-3 text-xs text-slate-500">{caja==='personal'?'Los gastos personales no mueven las cajas del negocio.':caja==='todas'?'Los traslados se muestran una sola vez y no alteran el total.':'Los traslados sí afectan el saldo de esta cuenta.'} Antes de comisiones. El movimiento neto no es el saldo bancario.</p>
    <ul className="mt-3 divide-y divide-slate-100">{filtradas.slice(0,limite).map(m=>{
      const importe = caja==='digital'?m.digital:caja==='efectivo'?m.efectivo:m.caja==='personal'?0:m.monto;
      return <li key={m.id}><Link href={m.href} className="flex items-start justify-between gap-3 px-5 py-4 hover:bg-slate-50"><span className="min-w-0"><span className="mb-1.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{tipos[m.tipo]}</span><b className="block break-words text-sm text-slate-900">{m.titulo}</b><span className="mt-1 block text-xs text-slate-500">{fechaLegible(m.fecha)} · {FUENTES[m.caja as keyof typeof FUENTES]??'Entre cuenta y efectivo'}</span><span className="mt-1 block break-words text-xs text-slate-500">{m.nota}</span></span>
        <span className="shrink-0 text-right"><b className={`block tabular-nums ${importe<0?'text-slate-900':importe>0?'text-teal-800':'text-slate-500'}`}>{m.caja==='personal'?clp(-m.personal):m.tipo==='traslado'&&caja==='todas'?'Sin cambio total':`${importe>0?'+':''}${clp(importe)}`}</b><span className={`mt-2 block text-[11px] ${m.confirmado===false?'text-amber-800':'text-slate-500'}`}>{m.confirmado===false?'Por confirmar':m.confirmado?'Confirmado':m.tipo==='traslado'?'Traslado interno':''}</span></span>
      </Link></li>;
    })}</ul>
    {filtradas.length===0 && <div className="p-10 text-center"><h3 className="font-semibold text-slate-900">Sin movimientos con estos filtros</h3><p className="mt-2 text-sm text-slate-500">Prueba otro mes o revisa todo el historial.</p></div>}
    {filtradas.length>limite && <div className="border-t border-slate-100 p-4 text-center"><button onClick={()=>setLimite(l=>l+25)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold">Ver 25 más · {filtradas.length-limite} restantes</button></div>}
  </section>;
}
