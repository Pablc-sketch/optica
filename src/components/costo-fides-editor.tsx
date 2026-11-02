'use client';
import { useActionState } from 'react';
import { actualizarCostoFides } from '@/lib/actions/cierre';
export default function CostoFidesEditor({ operativoId, actual, nota }: { operativoId:string; actual:number|null; nota:string|null }) {
  const [estado,action,pendiente] = useActionState(actualizarCostoFides,{});
  return <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Editar costo total de Fides</summary>
    <form action={action} className="mt-3 grid gap-3">
      <input type="hidden" name="operativo_id" value={operativoId} /><input type="hidden" name="anterior" value={actual ?? ''} />
      <label className="text-sm">Total real del laboratorio<input name="monto" type="number" min="0" step="1" defaultValue={actual ?? ''} required className="mt-1 w-full rounded-xl border p-3" /></label>
      <label className="text-sm">Motivo o referencia<input name="nota" defaultValue={nota ?? ''} maxLength={250} required placeholder="Factura, diferencia de precio…" className="mt-1 w-full rounded-xl border p-3" /></label>
      <p className="text-xs text-tinta-suave">Actualiza costos, pendientes y reparto. Los pagos registrados se conservan.</p>
      {estado.error && <p role="alert" className="text-sm text-red-700">{estado.error}</p>}
      {estado.guardado && <p role="status" className="text-sm text-emerald-800">Costo real guardado. Revisa el pendiente actualizado abajo.</p>}
      <button disabled={pendiente} className="rounded-xl bg-brand p-3 font-semibold text-white disabled:opacity-60">{pendiente ? 'Guardando…' : 'Guardar costo real'}</button>
    </form>
  </details>;
}
