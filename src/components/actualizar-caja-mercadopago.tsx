'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarArchivoMercadoPago } from '@/lib/actions/mercadopago';
export default function ActualizarCajaMercadoPago({ compacto = false }: { compacto?: boolean }) {
  const [automatico, setAutomatico] = useState(true);
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState('');
  const router = useRouter();
  useEffect(() => {
    if (!automatico) return;
    const refrescar = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) router.refresh();
    };
    const intervalo = setInterval(refrescar, 60000);
    document.addEventListener('visibilitychange', refrescar);
    window.addEventListener('online', refrescar);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', refrescar);
      window.removeEventListener('online', refrescar);
    };
  }, [automatico, router]);
  return <div className="flex flex-col items-start gap-2 sm:items-end">
    <div className="flex flex-wrap items-center gap-3">
      {!compacto && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatico} onChange={e => setAutomatico(e.target.checked)} />Autoactualizar</label>}
      <button disabled={pendiente} onClick={() => iniciar(async () => {
        setMensaje('');
        try { const r = await actualizarArchivoMercadoPago(); setMensaje(compacto && r.ok ? '' : r.mensaje); router.refresh(); }
        catch { setMensaje('No se pudo actualizar. Vuelve a intentar.'); }
      })} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pendiente ? 'Actualizando…' : compacto ? 'Actualizar' : 'Actualizar ahora'}</button>
    </div>
    {mensaje && <p role="status" className="text-sm">{mensaje}</p>}
  </div>;
}
