'use client';

import { useState, useTransition } from 'react';
import { buscarCobrosConTarjeta } from '@/lib/actions/mercadopago';
import type { CobroMPDisponible } from '@/lib/mercadopago-datos';
import { clp } from '@/lib/clp';

export default function ElegirCobroMercadoPago({ monto, medio, value, onChange, disabled }: {
  monto: number;
  medio: string;
  value?: string;
  onChange?: (id: string) => void;
  disabled?: boolean;
}) {
  const [pagos, setPagos] = useState<CobroMPDisponible[]>([]);
  const [elegido, setElegido] = useState('');
  const [aviso, setAviso] = useState('');
  const [buscando, iniciar] = useTransition();

  return <div className="w-full space-y-2 rounded-xl border border-tinta/15 bg-white p-3">
    <button type="button" disabled={disabled || buscando || monto <= 0} onClick={() => iniciar(async () => {
      setAviso('');
      try {
        const resultado = await buscarCobrosConTarjeta(monto, medio);
        if (resultado.error) { setAviso(resultado.error); return; }
        setPagos(resultado.cobros);
        setElegido('');
        onChange?.('');
        if (!resultado.cobros.length) setAviso('Todavía no aparece un cobro aprobado por ese monto y medio en el período consultado. Si ya cobraste en la máquina, espera unos segundos y vuelve a buscar.');
      } catch {
        setAviso('No se pudo consultar Mercado Pago. Reintenta la búsqueda sin volver a cobrar.');
      }
    })} className="min-h-11 rounded-xl border border-brand/40 px-3 py-2 text-sm font-semibold text-brand-dark disabled:opacity-50">
      {buscando ? 'Buscando…' : pagos.length ? 'Volver a buscar' : 'Buscar cobro en Mercado Pago'}
    </button>
    <label className="block text-sm font-semibold">
      Cobro aprobado{monto > 0 ? ` · ${clp(monto)}` : ''}
      <select name="numero_voucher" required disabled={disabled || buscando} value={value ?? elegido}
        onChange={e => { setElegido(e.target.value); onChange?.(e.target.value); }}
        className="mt-1 block w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-normal">
        <option value="">Selecciona por hora y operación</option>
        {pagos.map(p => <option key={p.id} value={p.id}>
          {new Date(p.fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'medium' })} · Operación {p.id}
        </option>)}
      </select>
    </label>
    {aviso && <p role="status" className="text-sm text-tinta-suave">{aviso}</p>}
  </div>;
}
