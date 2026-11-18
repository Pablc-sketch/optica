'use client';
import { useState } from 'react';
import { proyectarSalida } from '@/lib/presupuesto-salida';
import { clp } from '@/lib/clp';
const bases={equipos:300000,combustible:128000,peajes:50000,hospedaje:180000,comida:216000,sedes:80000,otros:146000};
export default function SimuladorSalida({titulo,fijosRegistrados}:{titulo:string;fijosRegistrados:number}) {
  const [fijos,setFijos]=useState(bases);
  const [p,setP]=useState({marcos:6000,cristales:8000,estuche:1000,precio:55000,cantidad:80,comisionPct:10,tarjetaPct:3,reservarIva:true});
  const total=Object.values(fijos).reduce((a,b)=>a+b,0);
  const n=proyectarSalida({...p,fijos:total});
  const ahorro=Math.max(0,Math.round(n.utilidad*.2)),porPersona=Math.max(0,Math.floor((n.utilidad-ahorro)/2));
  const campo='mt-1 w-full rounded-xl border bg-white p-3';
  return <details className="rounded-2xl border border-sky-200 bg-sky-50 p-4" open>
    <summary className="cursor-pointer text-xl font-bold">{titulo}</summary>
    <p className="mt-3 text-sm"><b>Simulación editable, no gastos reales ni precios publicados.</b> Equipos: $300.000 informados. Demás supuestos: 800 km a 10 km/l y $1.600/l; 3 personas, 6 días de comida a $12.000; 3 noches de hospedaje a $60.000 por grupo; sedes por confirmar; incluye provisión para entrega, imprevistos y desgaste. Cambia lo que no corresponda.</p>
    <h3 className="mt-4 font-bold">Gastos de toda la salida</h3><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries({equipos:'Equipos',combustible:'Combustible',peajes:'Peajes y TAG',hospedaje:'Hospedaje',comida:'Comida',sedes:'Arriendo de sedes',otros:'Entrega, desgaste e imprevistos'}).map(([k,nombre])=><label key={k} className="text-sm">{nombre}<input type="number" min={0} max={999999999} step={1} className={campo} value={fijos[k as keyof typeof fijos]} onChange={e=>setFijos({...fijos,[k]:Math.max(0,Number(e.target.value))})}/></label>)}</div>
    <p className="mt-3 font-bold">Fijos presupuestados: {clp(total)}</p><p className="text-sm">Costos fijos cargados en las sedes seleccionadas: {clp(fijosRegistrados)}. Se comparan; no se suman dos veces.</p>
    <h3 className="mt-4 font-bold">Venta y costo promedio por anteojo</h3><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries({marcos:'Marco',cristales:'Cristales + montaje',estuche:'Estuche y paño',precio:'Precio promedio final',cantidad:'Anteojos a vender',comisionPct:'Comisión venta %',tarjetaPct:'Comisión tarjeta %'}).map(([k,nombre])=><label key={k} className="text-sm">{nombre}<input type="number" min={0} max={k.endsWith('Pct')?100:999999999} step={k.endsWith('Pct')?0.01:1} className={campo} value={p[k as keyof typeof p] as number} onChange={e=>setP({...p,[k]:Math.max(0,Math.min(k.endsWith('Pct')?100:999999999,Number(e.target.value)))})}/></label>)}</div>
    <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={p.reservarIva} onChange={e=>setP({...p,reservarIva:e.target.checked})}/>Reservar IVA de las ventas (conservador, sin presumir crédito fiscal)</label>
    <p className="mt-2 text-xs">$8.000 de laboratorio es un supuesto para una mezcla principalmente de monofocales de stock. Si vendes bifocales, progresivos o tallados, sube también el costo promedio de cristales. No incluye ingresos por consultas ni sueldo fijo de los dueños.</p>
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Ventas',clp(n.ventas)],['Para no perder',n.empate===null?'Precio insuficiente':`${n.empate} anteojos`],['Aporte por anteojo',clp(n.aporte)],['Resultado estimado',clp(n.utilidad)]].map(([t,v])=><div key={t} className="rounded-xl bg-white p-3"><p className="text-sm">{t}</p><b className="mt-1 block text-xl">{v}</b></div>)}</div>
    <p className="mt-3 text-sm">Reserva IVA {clp(n.reserva)} · comisiones {clp(n.comisiones)} · costos {clp(n.costos)}. Con ahorro de 20%: {clp(ahorro)} para el negocio y {clp(porPersona)} para cada dueño, si todo se cobra. Antes del impuesto a la renta.</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-bold">Escenarios al precio promedio elegido</caption><thead><tr><th>Anteojos</th><th>Ventas</th><th>Resultado estimado</th></tr></thead><tbody>{[40,60,80,100].map(c=>{const s=proyectarSalida({...p,fijos:total,cantidad:c});return <tr key={c} className="border-t border-sky-200"><td className="py-3">{c}</td><td>{clp(s.ventas)}</td><td className={s.utilidad<0?'text-red-700':'text-emerald-800'}>{clp(s.utilidad)}</td></tr>;})}</tbody></table></div>
    <p className="mt-3 text-sm">Para ganar $500.000 vendiendo {p.cantidad} anteojos: precio promedio mínimo {n.precioPara(500000)===null?'no calculable':clp(n.precioPara(500000)!)}.</p>
  </details>;
}
