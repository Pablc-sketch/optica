import Link from 'next/link';
import { clp } from '@/lib/clp';
import type { SaldoMercadoPago } from '@/lib/mercadopago-saldo';

export default function SaldoCaja({ saldo, efectivo }: { saldo: SaldoMercadoPago; efectivo: number | null }) {
  const directo = saldo.estado === 'disponible';
  const reporte = saldo.estado === 'reporte' ? saldo : null;
  const total = directo && efectivo !== null ? saldo.disponible + efectivo : null;
  const fecha = (valor: string) => new Date(valor).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'short', timeStyle: 'short',
  });
  return <section aria-label="Saldo real de caja" className="rounded-2xl bg-tinta p-5 text-white sm:p-6">
    <h2 className="text-lg font-semibold">Disponible en Mercado Pago</h2>
    {directo ? <>
      <p className="mt-2 text-4xl font-bold tabular-nums">{clp(saldo.disponible)}</p>
      <p className="mt-1 text-sm text-white/80">Consultado {fecha(saldo.consultadoEn)}</p>
    </> : <>
      <p className="mt-2 text-lg font-semibold">Saldo en vivo por verificar</p>
      {saldo.estado !== 'no_configurado' && <a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-block rounded-xl bg-white px-4 py-3 text-sm font-semibold text-tinta">Ver saldo actual en Mercado Pago ↗</a>}
      {reporte && <p className="mt-3 text-sm text-white/80">Último saldo del reporte <strong>{clp(reporte.disponible)}</strong> · Corte {fecha(reporte.hasta)}</p>}
      {reporte?.reportesPausados && <p role="status" className="mt-2 text-sm text-white/80">Consulta del saldo pausada. Los cobros siguen sincronizándose.</p>}
    </>}
    <dl className="mt-4 grid gap-3 border-t border-white/30 pt-4 sm:grid-cols-2">
      <div><dt className="text-sm text-white/80">Efectivo contado</dt><dd className="text-xl font-semibold tabular-nums">{efectivo === null ? 'Por contar' : clp(efectivo)}</dd></div>
      {directo && <div><dt className="text-sm text-white/80">Mercado Pago + efectivo</dt><dd className="text-xl font-semibold tabular-nums">{total === null ? 'Por verificar' : clp(total)}</dd></div>}
    </dl>
    <Link href="/caja?ver=cuadrar" className="mt-4 inline-block px-1 py-2 text-sm font-semibold underline">Verificar saldos</Link>
  </section>;
}
