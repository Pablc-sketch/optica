'use client';
import { useEffect, useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarArchivoMercadoPago } from '@/lib/actions/mercadopago';
export default function ActualizarCajaMercadoPago() {
  const [automatico, setAutomatico] = useState(true);
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();
  const enCurso=useRef(false);
  useEffect(() => {
    if(!automatico)return;
    const refrescar=async()=>{
      if(enCurso.current||document.visibilityState!=='visible'||!navigator.onLine)return;
      enCurso.current=true;
      try{const r=await actualizarArchivoMercadoPago();setMensaje(r.ok?'Mercado Pago revisado.':r.mensaje);router.refresh();}
      catch{setMensaje('No se pudo verificar Mercado Pago. Los saldos anteriores pueden estar desactualizados.');}
      finally{enCurso.current=false;}
    };
    void refrescar();
    const intervalo=setInterval(()=>void refrescar(),60000);
    document.addEventListener('visibilitychange',refrescar);
    window.addEventListener('online',refrescar);
    return()=>{clearInterval(intervalo);document.removeEventListener('visibilitychange',refrescar);window.removeEventListener('online',refrescar);};
  },[automatico,router]);
  return <div className="flex flex-col items-start gap-2 sm:items-end">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatico} onChange={e => setAutomatico(e.target.checked)} />Autoactualizar</label>
      <button disabled={pendiente} onClick={() => iniciar(async () => {
        setMensaje('');
        try { const r = await actualizarArchivoMercadoPago(); setMensaje(r.mensaje); router.refresh(); }
        catch { setMensaje('No se pudo actualizar. Vuelve a intentar.'); }
      })} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pendiente ? 'Actualizando…' : 'Actualizar ahora'}</button>
    </div>
    {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
  </div>;
}
