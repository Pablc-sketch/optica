import Link from 'next/link';
import { clp } from '@/lib/clp';
import type { SaldoMercadoPago } from '@/lib/mercadopago-saldo';

function horaDeSaldo(valor: string) {
  return new Date(valor).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default function SaldoCaja({ saldo, efectivo }: { saldo: SaldoMercadoPago; efectivo: number | null }) {
  const directo = saldo.estado === 'disponible';
  const reporte = saldo.estado === 'reporte';
  const monto = directo || reporte ? saldo.disponible : null;
  const total = directo && efectivo !== null ? saldo.disponible + efectivo : null;

  return <section aria-label="Saldo de la óptica" className="rounded-2xl bg-tinta p-4 text-white sm:p-5">
    <h2 className="text-sm font-semibold">Mercado Pago · cuenta de la óptica</h2>
    <p className="mt-2 text-2xl font-bold tabular-nums sm:text-3xl">{monto === null ? 'Por verificar' : clp(monto)}</p>
    <p className="mt-1 text-xs text-white/80">
      {directo ? `Disponible · ${horaDeSaldo(saldo.consultadoEn)}`
        : reporte ? `Último saldo del reporte · corte ${horaDeSaldo(saldo.hasta)}`
        : saldo.estado === 'no_configurado' ? 'Cuenta sin conectar' : 'Saldo en vivo por verificar'}
    </p>
    {reporte && <p className="mt-1 text-xs text-white/80">
      {saldo.reportesPausados ? 'Consulta del saldo pausada.' : 'Saldo en vivo por verificar.'}
    </p>}
    <dl className="mt-4 space-y-2 border-t border-white/25 pt-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <dt>Efectivo según conteo</dt>
        <dd>{efectivo === null ? <Link href="/caja?ver=cuadrar" className="underline">Por contar</Link> : <strong className="tabular-nums">{clp(efectivo)}</strong>}</dd>
      </div>
      {directo && <div className="flex flex-wrap items-center justify-between gap-x-2">
        <dt>Mercado Pago + efectivo</dt>
        <dd className="font-semibold tabular-nums">{total === null ? 'Por verificar' : clp(total)}</dd>
      </div>}
    </dl>
  </section>;
}
