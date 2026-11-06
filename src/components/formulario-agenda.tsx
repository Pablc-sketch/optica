'use client';
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ResultadoAgenda } from '@/lib/actions/agenda-terreno';

export default function FormularioAgenda({ accion, etiqueta = 'Guardar', children, limpiar = false }:
  { accion: (datos: FormData) => Promise<ResultadoAgenda>; etiqueta?: string; children: ReactNode; limpiar?: boolean }) {
  const [pendiente, iniciar] = useTransition();
  const [estado, setEstado] = useState<ResultadoAgenda>({});
  const router = useRouter();
  return <form onSubmit={e => {
    e.preventDefault();
    if (pendiente) return;
    const form = e.currentTarget, datos = new FormData(form);
    setEstado({});
    iniciar(async () => {
      try {
        const r = await accion(datos);
        setEstado(r);
        if (r.href) router.push(r.href);
        else if (limpiar && r.mensaje) form.reset();
      } catch { setEstado({error:'No se pudo guardar. Revisa la conexión e intenta de nuevo.'}); }
    });
  }}>
    <fieldset disabled={pendiente} className="space-y-3">
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60">{pendiente ? 'Guardando…' : etiqueta}</button>
        {estado.error && <p role="alert" className="text-sm text-red-800">{estado.error}</p>}
        {estado.mensaje && <p role="status" className="text-sm text-emerald-800">{estado.mensaje}</p>}
      </div>
    </fieldset>
  </form>;
}
