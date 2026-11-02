'use client';
import { useActionState, type ReactNode } from 'react';
import { registrarMovimientoCaja } from '@/lib/actions/caja';
export default function CajaFormulario({ children, texto = 'Guardar' }: { children: ReactNode; texto?: string }) {
  const [estado, action, pendiente] = useActionState(registrarMovimientoCaja, {});
  return <form action={action} className="grid gap-3">
    {children}
    {estado.error && <p role="alert" className="text-sm text-red-700">{estado.error}</p>}
    <button disabled={pendiente} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-60">{pendiente ? 'Guardando…' : texto}</button>
  </form>;
}
