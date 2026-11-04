'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
export default function RefrescarFinanzas() {
  const [pendiente,iniciar] = useTransition();
  const router = useRouter();
  return <button disabled={pendiente} onClick={()=>iniciar(()=>router.refresh())} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{pendiente?'Actualizando…':'Actualizar saldos'}</button>;
}
