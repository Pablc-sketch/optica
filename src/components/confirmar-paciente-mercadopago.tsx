'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { confirmarPacienteMercadoPago } from '@/lib/actions/mercadopago';
import type { IdentidadAbonoMercadoPago } from '@/lib/mercadopago-datos';
import { formatearRut } from '@/lib/rut';
import { clp } from '@/lib/clp';

export default function ConfirmarPacienteMercadoPago({ pagoId, abonoId, identidad }: {
  pagoId: string; abonoId: string; identidad: IdentidadAbonoMercadoPago;
}) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, cambiarMensaje] = useState('');
  const router = useRouter();
  return <details className="mt-3 rounded-lg border p-3">
    <summary className="cursor-pointer font-semibold">Cotejar y confirmar paciente</summary>
    <p className="mt-2">Compra de <b>{identidad.paciente_nombre}</b> · RUT {formatearRut(identidad.paciente_rut)} · abono {clp(identidad.monto)}.</p>
    <p className="mt-2 text-xs text-tinta-suave">Compara la operación con el comprobante original y el abono de esta compra. Mercado Pago acredita la operación, pero no identifica al paciente beneficiario.</p>
    <form className="mt-3 flex flex-col gap-3" onSubmit={e => {
      e.preventDefault(); const datos = new FormData(e.currentTarget);
      iniciar(async () => {
        try {
          const r = await confirmarPacienteMercadoPago({ pagoId, abonoId, identidad,
            operacionEscrita: String(datos.get('operacion') ?? ''), cotejado: datos.get('cotejado') === 'on' });
          cambiarMensaje(r.mensaje); if (r.ok) router.refresh();
        } catch { cambiarMensaje('No se pudo confirmar. Recarga y vuelve a cotejar el original.'); }
      });
    }}>
      <label className="flex items-start gap-2"><input name="cotejado" type="checkbox" required className="mt-1" />Cotejé el original y confirmo que este pago corresponde a la compra de {identidad.paciente_nombre}.</label>
      <label className="flex flex-col gap-1">Escribe la operación completa del original
        <input name="operacion" required inputMode="numeric" pattern="[0-9]{8,30}" maxLength={30} autoComplete="off" className="rounded-lg border px-3 py-2" />
      </label>
      <button disabled={pendiente} className="self-start rounded-lg border px-3 py-2 disabled:opacity-50">{pendiente ? 'Confirmando…' : 'Confirmar este paciente y proteger abono'}</button>
      <p aria-live="polite">{mensaje}</p>
    </form>
  </details>;
}
