'use client';
import {useEffect,useRef,useState,useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {prepararPoint,cobrarConPoint,consultarPoint} from '@/lib/actions/mercadopago-point';
import {clp} from '@/lib/clp';
export default function CobrarPoint({ventaId,saldo}:{ventaId:string;saldo:number}){
 const [abierto,setAbierto]=useState(false),[mensaje,setMensaje]=useState('');
 const [terminales,setTerminales]=useState<{id:string;modo:string}[]>([]),[terminal,setTerminal]=useState('');
 const [monto,setMonto]=useState(String(saldo)),[intento,setIntento]=useState<string|null>(null),[esperando,setEsperando]=useState(false);
 const [ocupado,iniciar]=useTransition();const ref=useRef<string|null>(null);const router=useRouter();
 useEffect(()=>{
  if(!esperando||!intento)return;
  const revisar=async()=>{if(document.visibilityState!=='visible'||!navigator.onLine)return;
   const r=await consultarPoint(intento);
   if(!r.ok){setMensaje(r.error);return;}
   if(r.confirmado){setMensaje(`Cobro confirmado · operación ${r.voucher}`);setEsperando(false);router.refresh();}
   else if(['failed','canceled','expired','refunded'].includes(r.estado)){setMensaje('La máquina cerró el intento sin un pago confirmado. Revisa el comprobante antes de iniciar otro.');setEsperando(false);ref.current=null;setIntento(null);}
  };
  const timer=setInterval(()=>void revisar(),4000);return()=>clearInterval(timer);
 },[esperando,intento,router]);
 return <section className="mt-3 rounded-xl border border-accent/30 bg-sky-50 p-3">
  <button type="button" disabled={ocupado} className="w-full rounded-xl bg-accent-dark px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={()=>iniciar(async()=>{
   setAbierto(true);setMensaje('Consultando máquina…');
   const r=await prepararPoint(ventaId);
   if(!r.ok){setMensaje(r.error);return;}
   setTerminales(r.terminales);setTerminal(r.previo?.terminal_id??r.terminales.find(t=>t.modo==='PDV')?.id??'');
   if(r.previo){ref.current=r.previo.id;setIntento(r.previo.id);setMonto(String(r.previo.monto));setEsperando(Boolean(r.previo.order_id));}else{ref.current=null;setIntento(null);setEsperando(false);}
   setMensaje(r.terminales.length?'La compra se confirma cuando Mercado Pago apruebe el cobro.':'No hay una terminal Point compatible disponible en esta cuenta.');
  })}>Cobrar con máquina desde Lentia</button>
  {abierto&&<div className="mt-3 space-y-3">
   <label className="block text-sm">Monto a enviar<input className="mt-1 w-full rounded-xl border bg-white p-3" aria-label="Monto para Point" type="number" min={1} max={saldo} step={1} disabled={Boolean(intento)} value={monto} onChange={e=>setMonto(e.target.value)}/></label>
   <label className="block text-sm">Máquina<select className="mt-1 w-full rounded-xl border bg-white p-3" value={terminal} disabled={Boolean(intento)} onChange={e=>setTerminal(e.target.value)}><option value="">Elegir máquina</option>{terminales.map(t=><option key={t.id} value={t.id}>{t.id.slice(-12)} · {t.modo==='PDV'?'integrada':'requiere modo PDV'}</option>)}</select></label>
   <button type="button" disabled={ocupado||esperando||!terminal||!Number.isSafeInteger(Number(monto))||Number(monto)<=0||Number(monto)>saldo} className="rounded-xl bg-tinta px-4 py-3 font-semibold text-white disabled:opacity-50" onClick={()=>iniciar(async()=>{
    ref.current??=crypto.randomUUID();setIntento(ref.current);
    const r=await cobrarConPoint({ventaId,intentoId:ref.current,monto:Number(monto),terminalId:terminal});
    if(!r.ok){setMensaje(r.error);return;}
    setMensaje(r.confirmado?`Confirmado · operación ${r.voucher}`:`Esperando el pago de ${clp(Number(monto))} en la máquina…`);
    setEsperando(!r.confirmado&&['created','at_terminal','action_required'].includes(r.estado));
    if(r.confirmado)router.refresh();
   })}>{ocupado?'Comprobando…':esperando?'Esperando máquina…':intento?'Recuperar este intento':'Enviar cobro a la máquina'}</button>
  </div>}
  {mensaje&&<p role="status" className="mt-3 text-sm">{mensaje}</p>}
 </section>;
}
