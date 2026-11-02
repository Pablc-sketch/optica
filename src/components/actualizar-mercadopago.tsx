'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { actualizarArchivoMercadoPago } from '@/lib/actions/mercadopago';

export default function ActualizarMercadoPago() {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, cambiarMensaje] = useState('');
  const router = useRouter();
  return <div className="mt-3">
    <button disabled={pendiente} onClick={() => iniciar(async () => {
      try { const r = await actualizarArchivoMercadoPago(); cambiarMensaje(r.mensaje); router.refresh(); }
      catch { cambiarMensaje('No se pudo actualizar. Vuelve a intentar.'); }
    })} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{pendiente ? 'Actualizando…' : 'Actualizar archivo'}</button>
    <p aria-live="polite" className="mt-1 text-sm">{mensaje}</p>
  </div>;
}
