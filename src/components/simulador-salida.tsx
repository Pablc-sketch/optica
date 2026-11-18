'use client';
import { useState } from 'react';
import { NIVELES_MARCO,type RecargosMarcos } from '@/lib/niveles-marco';
import { aportePorPar,type PerfilPrecio } from '@/lib/rentabilidad-precios';
import { clp } from '@/lib/clp';
export default function SimuladorSalida({titulo,fijosRegistrados,equiposRegistrados,esSalidaNoviembre,perfiles,recargosMarcos,debito,credito,historica,comisionVenta}:{titulo:string;fijosRegistrados:number;equiposRegistrados:number;esSalidaNoviembre:boolean;perfiles:PerfilPrecio[];recargosMarcos:RecargosMarcos|null;debito:number;credito:number;historica:number|null;comisionVenta:number}){
 const [perfilId,setPerfilId]=useState(perfiles.find(p=>p.nombre==='Monofocal · Orgánico Antirreflejo')?.id??perfiles[0]?.id??'');
 const [cantidades,setCantidades]=useState({esencial:20,seleccion:20,premium:10});
 const [fijos,setFijos]=useState({equipos:esSalidaNoviembre?fijosRegistrados+Math.max(0,300000-equiposRegistrados):fijosRegistrados,combustible:0,peajes:0,hospedaje:0,comida:0,sedes:0,otros:0});
 const [costos,setCostos]=useState({marco:6000,estuche:1000,vendedora:comisionVenta});
 const [medio,setMedio]=useState(historica===null?'debito':'historico');
 const [completo,setCompleto]=useState(false);
 const perfil=perfiles.find(p=>p.id===perfilId);
 if(!perfil)return <p role="alert">Falta el catálogo para evaluar rentabilidad. Revisa Precios.</p>;
 const tasa=medio==='historico'?(historica??debito):medio==='debito'?debito:medio==='credito'?credito:0;
 const niveles=NIVELES_MARCO.filter(n=>recargosMarcos||n.id!=='seleccion');
 const calculos=niveles.map(n=>({...n,cantidad:cantidades[n.id],...aportePorPar(perfil,n.id,recargosMarcos,costos.marco,costos.estuche,costos.vendedora,tasa)}));
 const cantidad=calculos.reduce((s,n)=>s+n.cantidad,0),totalFijos=Object.values(fijos).reduce((s,n)=>s+n,0);
 const ventas=calculos.reduce((s,n)=>s+n.precio*n.cantidad,0),aporte=calculos.reduce((s,n)=>s+n.operativo*n.cantidad,0),reserva=calculos.reduce((s,n)=>s+n.iva*n.cantidad,0);
 const resultado=aporte-totalFijos-reserva,porPar=cantidad?(aporte-reserva)/cantidad:0;
 const campo='mt-1 block w-full rounded-xl border bg-white p-3';
 const numero=(v:string,max=999999999)=>Math.min(max,Math.max(0,Math.floor(Number(v)||0)));
 return <section className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4">
  <h2 className="text-xl font-bold">{titulo}</h2><p className="text-sm">Elige el cristal y cuántos pares venderías en cada línea. Es un escenario editable; no registra ventas ni gastos.</p>
  <label className="block text-sm font-semibold">Cristal por par<select className={campo} value={perfilId} onChange={e=>setPerfilId(e.target.value)}>{perfiles.map(p=><option key={p.id} value={p.id}>{p.nombre} · {p.origen}</option>)}</select></label>
  <p className="text-sm">Cristales + montaje + IVA: <b>{clp(perfil.costo)}</b> según catálogo del laboratorio, para rango ±2.00 / ±2.00. Otras recetas cambian el costo y el precio.</p>
  <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Línea de marco</th><th>Precio final</th><th>Pares</th><th>Aporte por par*</th></tr></thead><tbody>{calculos.map(n=><tr key={n.id} className="border-t border-sky-200"><th className="py-3">{n.nombre}</th><td>{clp(n.precio)}</td><td className="w-24 px-2"><input aria-label={`Pares ${n.nombre}`} className={campo} type="number" min={0} max={9999} step={1} value={n.cantidad} onChange={e=>setCantidades({...cantidades,[n.id]:numero(e.target.value,9999)})}/></td><td>{clp(n.conReserva)}</td></tr>)}</tbody></table></div>
  <p className="text-xs">*Disponible para cubrir la salida después de marco, laboratorio, estuche, comisión y reserva conservadora de todo el IVA de venta. No es utilidad final.</p>
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-sm">Medios de pago<select className={campo} value={medio} onChange={e=>setMedio(e.target.value)}>{historica!==null&&<option value="historico">Como mis ventas anteriores</option>}<option value="debito">Todo débito</option><option value="credito">Todo crédito</option><option value="efectivo">Efectivo / transferencia</option></select></label><p className="self-center text-sm">Tasa aplicada {tasa.toFixed(2)}%. Tasas guardadas: débito {debito.toFixed(2)}%, crédito {credito.toFixed(2)}%. La mezcla histórica considera montos cobrados.</p></div>
  <details><summary className="cursor-pointer font-semibold">Revisar costos por par y comisión</summary><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">{([['marco','Marco (provisión para las tres líneas)'],['estuche','Estuche y paño (estimado)'],['vendedora','Comisión de venta %']] as const).map(([k,n])=><label className="text-sm" key={k}>{n}<input className={campo} type="number" min={0} max={k==='vendedora'?100:999999999} value={costos[k]} onChange={e=>setCostos({...costos,[k]:numero(e.target.value,k==='vendedora'?100:999999999)})}/></label>)}</div><p className="mt-2 text-xs">Marco $6.000 y estuche $1.000 son provisiones editables. Si los marcos de otra línea cuestan más, aumenta la provisión antes de decidir.</p></details>
  <h3 className="font-bold">Gastos de toda la salida (se cuentan una sola vez)</h3><p className="text-sm">{esSalidaNoviembre?'Equipos: $300.000 informados para el 23–28.':'El primer importe incluye los fijos registrados en las sedes seleccionadas.'} Fijos ya cargados: {clp(fijosRegistrados)}. Están incluidos en el primer importe; no los repitas abajo.</p>
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries({equipos:esSalidaNoviembre?'Equipos / fijos ya cargados':'Fijos ya cargados',combustible:'Combustible',peajes:'Peajes y TAG',hospedaje:'Hospedaje',comida:'Comida',sedes:'Sedes',otros:'Entrega y otros'}).map(([k,n])=><label key={k} className="text-sm">{n}<input className={campo} type="number" min={0} max={999999999} step={1} value={fijos[k as keyof typeof fijos]} onChange={e=>setFijos({...fijos,[k]:numero(e.target.value)})}/></label>)}</div>
  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={completo} onChange={e=>setCompleto(e.target.checked)}/>Ya revisé e incluí todos los gastos de la salida</label>
  {!completo&&<p role="status" className="rounded-xl bg-amber-100 p-3 font-semibold text-amber-900">Presupuesto incompleto: $0 no significa confirmado gratis. Falta revisar combustible, peajes, hospedaje, comida, sedes y entrega.</p>}
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Ventas simuladas',clp(ventas)],['Fijos de la salida',clp(totalFijos)],['Pares para cubrir fijos',porPar>0?String(Math.ceil(totalFijos/porPar)):'Precio insuficiente'],[completo?'Resultado con reserva IVA':'Resultado parcial con reserva IVA',clp(resultado)]].map(([t,v])=><div key={t} className="rounded-xl bg-white p-3"><p className="text-sm">{t}</p><b className="mt-1 block text-xl">{v}</b></div>)}</div>
  <p className="text-sm">Antes de reserva IVA: {clp(aporte-totalFijos)}. Reserva IVA: {clp(reserva)}. El IVA incluido se calcula dividiendo el precio por 1,19; no restando 19%. No se presumen créditos fiscales: el F29 real puede ser menor con facturas válidas. Resultado antes de impuesto a la renta, ahorro y reparto; supone que se cobra todo.</p>
  <p className="text-sm">El punto de equilibrio conserva la mezcla elegida de líneas y sus costos. No incluye ingresos de consultas ni sueldo fijo de los dueños.</p>
 </section>;
}
