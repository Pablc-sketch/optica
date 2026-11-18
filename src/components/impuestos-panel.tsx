'use client';
import {useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {guardarImpuesto,registrarPagoSii,desvincularPagoSii} from '@/lib/actions/impuestos';
import {impuestoDeMes,type MesImpuesto,type PagoImpuesto} from '@/lib/impuestos';
import {clp} from '@/lib/clp';
type Fila={mes:MesImpuesto;registradas:number;n:ReturnType<typeof impuestoDeMes>};
type Gasto={id:string;fecha:string;monto:number;caja:string;descripcion:string;categoria:string;operativo_id:string|null};
const campo='mt-1 w-full rounded-xl border bg-white p-3';
export default function ImpuestosPanel({filas,pagos,gastos,gastosEnCostos,hoy}:{filas:Fila[];pagos:PagoImpuesto[];gastos:Gasto[];gastosEnCostos:string[];hoy:string}){
  const router=useRouter(),[pendiente,iniciar]=useTransition();
  const [aviso,setAviso]=useState(''),[error,setError]=useState('');
  const [editor,setEditor]=useState<MesImpuesto|null>(null);
  const [pago,setPago]=useState<{id:string;periodo:string;monto:string;fecha:string;caja:string;gastoId:string}|null>(null);
  const [ver,setVer]=useState('todos');
  const candidatos=gastos.filter(g=>!g.operativo_id&&g.categoria==='otro'&&g.monto>0&&!/^(Costo operativo · |Fides · |Marcos · )/.test(g.descripcion)&&!gastosEnCostos.includes(g.id)&&!pagos.some(p=>p.gasto_id===g.id&&!p.anulado_en));
  async function ejecutar(accion:()=>Promise<{error?:string;ok?:boolean}>,mensaje:string){
    setError('');setAviso('');
    try{const r=await accion();if(r.error)setError(r.error);else{setEditor(null);setPago(null);setAviso(mensaje);router.refresh();}}catch{setError('No se pudo confirmar. Recarga y revisa antes de reintentar.');}
  }
  const tabla=filas.map((f,i)=>({...f,acumulado:filas.slice(0,i+1).reduce((s,a)=>s+a.n.saldo,0)}));
  const patch=(p:Partial<MesImpuesto>)=>setEditor(m=>m?{...m,...p}:m);
  return <>
    <nav className="flex flex-wrap gap-2" aria-label="Estado de impuestos">{[['todos','Todos los meses'],['pendientes','Pendientes'],['pagados','Saldados']].map(([id,t])=><button key={id} onClick={()=>setVer(id)} aria-pressed={ver===id} className={`rounded-xl px-4 py-3 font-semibold ${ver===id?'bg-tinta text-white':'bg-white'}`}>{t}</button>)}</nav>
    <button onClick={()=>setEditor({periodo:hoy.slice(0,7)+'-01',ventas_afectas:null,credito_fiscal:0,ppm:0,otros:0,recargos:0,total_declarado:null,vence_el:null,nota:'',version:-1})} className="rounded-xl border bg-white px-4 py-3 font-semibold">Agregar período anterior</button>
    {aviso&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">{aviso}</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}
    {editor&&<form className="space-y-3 rounded-2xl border-2 border-brand bg-white p-4" onSubmit={e=>{e.preventDefault();iniciar(()=>ejecutar(()=>guardarImpuesto(editor),'Período guardado. Saldo mensual y acumulado actualizados.'));}}>
      <h2 className="text-lg font-bold">Revisar período tributario</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="text-sm">Mes de ventas y compras<input type="month" className={campo} required max={hoy.slice(0,7)} disabled={editor.version>=0} value={editor.periodo.slice(0,7)} onChange={e=>{const periodo=e.target.value+'-01';patch(filas.find(f=>f.mes.periodo===periodo)?.mes??{...editor,periodo,version:-1});}}/></label>
        <label className="text-sm">Ventas afectas brutas (vacío: registradas)<input className={campo} type="number" min={0} step={1} value={editor.ventas_afectas??''} onChange={e=>patch({ventas_afectas:e.target.value===''?null:Number(e.target.value)})}/></label>
        {Object.entries({credito_fiscal:'Crédito fiscal utilizable confirmado',ppm:'PPM confirmado (monto)',otros:'Retenciones y otros impuestos',recargos:'Recargos confirmados (solo estimación)'}).map(([k,t])=><label key={k} className="text-sm">{t}<input className={campo} type="number" min={0} step={1} required value={editor[k as 'credito_fiscal'|'ppm'|'otros'|'recargos']} onChange={e=>patch({[k]:Number(e.target.value)})}/></label>)}
        <label className="text-sm font-semibold">Total declarado F29, incluidos recargos<input className={campo} type="number" min={0} step={1} value={editor.total_declarado??''} placeholder="Vacío: sigue siendo estimación" onChange={e=>patch({total_declarado:e.target.value===''?null:Number(e.target.value)})}/></label>
        <label className="text-sm">Vencimiento confirmado<input className={campo} type="date" value={editor.vence_el??''} onChange={e=>patch({vence_el:e.target.value||null})}/></label>
      </div>
      <label className="block text-sm">Referencia / folio o nota<input className={campo} maxLength={500} value={editor.nota} onChange={e=>patch({nota:e.target.value})}/></label>
      <p className="text-xs text-tinta-suave">Guardar no declara ni paga al SII. El total declarado reemplaza la estimación e incluye los recargos: no se suman dos veces. No ingreses el saldo acumulado como impuesto de otro mes.</p>
      <div className="flex gap-2"><button disabled={pendiente} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">Guardar período</button><button type="button" disabled={pendiente} onClick={()=>setEditor(null)} className="rounded-xl border px-4 py-3">Cancelar</button></div>
    </form>}
    {pago&&<form className="space-y-3 rounded-2xl border-2 border-emerald-600 bg-white p-4" onSubmit={e=>{e.preventDefault();iniciar(()=>ejecutar(()=>registrarPagoSii({...pago,monto:Number(pago.monto),gastoId:pago.gastoId||undefined}),'Pago registrado una sola vez; saldo actualizado.'));}}>
      <h2 className="text-lg font-bold">Registrar pago ya realizado · {pago.periodo.slice(0,7)}</h2>
      <label className="block text-sm">¿Ya está anotado como gasto?<select className={campo} value={pago.gastoId} onChange={e=>{const g=candidatos.find(g=>g.id===e.target.value);setPago({...pago,gastoId:e.target.value,...(g?{monto:String(g.monto),fecha:g.fecha,caja:g.caja}:{})});}}><option value="">No: registrar gasto y pago juntos</option>{candidatos.map(g=><option key={g.id} value={g.id}>{g.fecha} · {g.descripcion} · {clp(g.monto)}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Monto efectivamente pagado<input className={campo} type="number" min={1} step={1} required disabled={!!pago.gastoId} value={pago.monto} onChange={e=>setPago({...pago,monto:e.target.value})}/></label><label className="text-sm">Fecha real<input className={campo} type="date" max={hoy} required disabled={!!pago.gastoId} value={pago.fecha} onChange={e=>setPago({...pago,fecha:e.target.value})}/></label></div>
      <label className="block text-sm">Origen<select className={campo} disabled={!!pago.gastoId} value={pago.caja} onChange={e=>setPago({...pago,caja:e.target.value})}><option value="digital">Cuenta bancaria</option><option value="efectivo">Efectivo</option><option value="personal">Dinero personal</option></select></label>
      <p className="text-xs">Lentia registra lo pagado; no transfiere dinero. Vincular un gasto existente no genera otra salida de caja. Un abono interno no acredita que el F29 esté aceptado.</p>
      <div className="flex gap-2"><button disabled={pendiente} className="rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white">Guardar pago realizado</button><button type="button" disabled={pendiente} onClick={()=>setPago(null)} className="rounded-xl border px-4 py-3">Cancelar</button></div>
    </form>}
    <div className="overflow-x-auto rounded-2xl bg-white p-3"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr><th className="p-3">Período</th><th>Total mensual</th><th>Pagado</th><th>Pendiente</th><th>Acumulado</th><th>Acciones</th></tr></thead><tbody>{tabla.filter(f=>ver==='todos'||(ver==='pendientes'?f.n.saldo>0:f.n.declarado&&f.n.saldo===0)).map(f=><tr key={f.mes.periodo} className="border-t border-tinta/10 align-top">
      <th className="p-3">{f.mes.periodo.slice(0,7)}<span className={`block text-xs font-normal ${f.n.vencido?'text-red-700':'text-tinta-suave'}`}>{f.n.declarado?(f.n.vencido?'Declarado · vencido':f.n.saldo?'Declarado':'Declarado · saldado'):'Estimación por revisar'}</span>{f.mes.vence_el&&<span className="block text-xs font-normal">Vence {f.mes.vence_el}</span>}</th>
      <td className="py-3 pr-3 tabular-nums">{clp(f.n.total)}{!f.n.declarado&&<span className="block text-xs">Créditos y PPM por revisar</span>}</td><td className="py-3 pr-3 tabular-nums">{clp(f.n.pagado)}{f.n.extra>0&&<span className="block text-xs text-amber-900">{clp(f.n.extra)} sobre el total</span>}</td><td className="py-3 pr-3 font-bold tabular-nums">{clp(f.n.saldo)}</td><td className="py-3 pr-3 tabular-nums">{clp(f.acumulado)}<span className="block text-xs text-tinta-suave">Incluye estimaciones</span></td>
      <td className="space-y-2 py-3"><button onClick={()=>{setPago(null);setEditor(f.mes);setError('');}} className="block rounded-xl border px-3 py-2 font-semibold">Revisar F29</button><button onClick={()=>{setEditor(null);setPago({id:crypto.randomUUID(),periodo:f.mes.periodo,monto:f.n.saldo?String(f.n.saldo):'',fecha:hoy,caja:'digital',gastoId:''});setError('');}} className="block rounded-xl bg-emerald-800 px-3 py-2 font-semibold text-white">Registrar pago</button></td>
    </tr>)}</tbody></table></div>
    <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">Historial de pagos al SII</summary>{pagos.map(p=>{const g=gastos.find(g=>g.id===p.gasto_id);return <div key={p.id} className="mt-3 border-t pt-3 text-sm"><p>{p.periodo.slice(0,7)} · {clp(g?.monto??0)} · {g?.fecha} · {p.anulado_en?'Vínculo anulado':'Pago registrado'}</p>{!p.anulado_en&&<button disabled={pendiente} onClick={()=>iniciar(()=>ejecutar(()=>desvincularPagoSii(p.id),'Vínculo anulado. El gasto se conserva para revisión.'))} className="mt-2 rounded-xl border px-3 py-2">Desvincular del mes, conservar gasto</button>}</div>;})}{pagos.length===0&&<p className="mt-3 text-sm">Sin pagos confirmados en este control.</p>}</details>
  </>;
}
