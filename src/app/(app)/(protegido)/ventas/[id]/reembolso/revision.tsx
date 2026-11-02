'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GUIAS_REEMBOLSO, pendientesCompra, type CompraReembolso } from '@/lib/reembolso';
import { fechaDocumentos } from '@/lib/fecha-documentos';
import { guardarReembolso } from '@/lib/actions/seguros';
import { formatearRut } from '@/lib/rut';
import { clp } from '@/lib/clp';

export default function RevisionReembolso({ compra }: { compra: CompraReembolso }) {
  const [entidad, setEntidad] = useState(compra.reembolso_entidad ?? 'fonasa');
  const [fecha, setFecha] = useState(fechaDocumentos(compra.fecha,compra.pagos,compra.fecha_documentos));
  const [mensaje, setMensaje] = useState('');
  const [ocupado, iniciar] = useTransition();
  const router = useRouter();
  const pendientes = pendientesCompra(compra);
  const cambios = fecha !== fechaDocumentos(compra.fecha,compra.pagos,compra.fecha_documentos) || entidad !== (compra.reembolso_entidad ?? 'fonasa');
  function guardar(destino?: string) {
    iniciar(async () => {
      try {
        const r = await guardarReembolso(compra.id,fecha,entidad);
        if (!r.ok) { setMensaje(r.error ?? 'No se pudo guardar.'); return; }
        setMensaje('Guardado');
        if (destino) router.push(`/ventas/${compra.id}/${destino}`); else router.refresh();
      } catch { setMensaje('No se pudo guardar. Intenta de nuevo.'); }
    });
  }
  const boton = 'rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50';
  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <Link href={`/ventas/${compra.id}`} className="text-sm underline">← Compra</Link>
    <header><h1 className="text-2xl font-bold">Reembolso</h1>
      <p className="mt-1 font-semibold">{compra.paciente?.nombre} · {clp(compra.total)}</p>
      <p className="text-sm text-tinta-suave">{formatearRut(compra.paciente?.rut)}</p>
    </header>
    <form onSubmit={e => { e.preventDefault(); guardar(); }} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">Presentar en
          <select value={entidad} disabled={ocupado} onChange={e => { setEntidad(e.target.value as typeof entidad); setMensaje(''); }} className="rounded-lg border bg-white p-3 text-base">
            <option value="fonasa">Fonasa</option><option value="banmedica">Banmédica</option><option value="complementario">Seguro complementario</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">Fecha de los documentos
          <input type="date" value={fecha} required disabled={ocupado} onChange={e => { setFecha(e.target.value); setMensaje(''); }} className="rounded-lg border bg-white p-3 text-base" />
        </label>
      </div>
      <p className="text-xs text-tinta-suave">Se aplica al certificado y comprobante. Pagos, receta y boleta conservan sus fechas reales.</p>
      <div className="flex items-center gap-3"><button disabled={ocupado || !fecha || compra.anulada} className={boton}>{ocupado ? 'Guardando…' : 'Guardar cambios'}</button>
        <span role="status" className="text-sm">{mensaje || (cambios ? 'Cambios sin guardar' : 'Datos guardados')}</span>
      </div>
    </form>
    <button disabled={ocupado || !fecha || compra.anulada} onClick={() => guardar('expediente')} className="rounded-xl bg-brand px-4 py-4 font-semibold text-white disabled:opacity-50">{ocupado ? 'Guardando…' : 'Guardar y preparar PDF'}</button>
    <div className="flex flex-wrap gap-2">
      {entidad === 'fonasa' && <button disabled={ocupado || compra.anulada} onClick={() => guardar('certificado-fonasa')} className={boton}>Ver certificado</button>}
      <button disabled={ocupado || compra.anulada} onClick={() => guardar('comprobante')} className={boton}>Ver comprobante</button>
    </div>
    {pendientes.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Revisar datos ({pendientes.length})</summary>
      <ul className="mt-2 list-inside list-disc space-y-1">{pendientes.map(p => <li key={p}>{p}</li>)}</ul>
      <Link href={`/ventas/${compra.id}`} className="mt-2 inline-block underline">Editar compra y abonos</Link>
    </details>}
    <a href={GUIAS_REEMBOLSO[entidad].url} target="_blank" rel="noopener noreferrer" className="text-sm text-tinta-suave underline">Requisitos de {GUIAS_REEMBOLSO[entidad].nombre} ↗</a>
  </div>;
}
