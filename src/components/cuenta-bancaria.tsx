import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { consultarSaldoMercadoPago } from '@/lib/mercadopago-saldo';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { clp } from '@/lib/clp';
export default async function CuentaBancaria({ tenantId, obligaciones, registrado }: { tenantId: string; obligaciones?: number; registrado?: { saldo: number; maquina: number; transferencias: number; salidas: number; comisiones: number } }) {
  const configurado = mercadoPagoConfigurado(tenantId);
  const supabase = await createClient();
  const { data, error } = await supabase.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenantId).maybeSingle();
  const saldo = !configurado ? { estado: 'sin_configurar' as const } : error ? { estado: 'error' as const } : await consultarSaldoMercadoPago(tenantId,data?.collector_id ?? null);
  return <section className="rounded-2xl bg-tinta p-5 text-white shadow-sm">
    <h2 className="font-bold">Cuenta bancaria (Mercado Pago)</h2>
    {saldo.estado === 'disponible' ? <><p className="mt-2 text-4xl font-bold tabular-nums text-emerald-300">{clp(saldo.disponible)}</p>
      <p className="mt-1 text-xs text-white/75">Disponible · consultado {new Date(saldo.consultadoEn).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</p>
      {obligaciones !== undefined && <p className="mt-3 border-t border-white/20 pt-3 text-sm">Saldo bancario menos todos los pendientes y ahorro: <b>{clp(saldo.disponible-obligaciones)}</b></p>}</>
      : <><p className="mt-2 font-semibold">Saldo bancario no disponible</p><p className="mt-1 text-sm text-white/80">{saldo.estado === 'sin_configurar' ? 'Conecta la cuenta en Configuración → Integraciones.' : saldo.estado === 'no_habilitado' ? 'Mercado Pago no habilitó esta consulta de saldo.' : 'No se pudo verificar el saldo de la cuenta.'}</p></>}
    {registrado && <details className="mt-4 rounded-xl border border-white/20 p-3" open={saldo.estado !== 'disponible'}><summary className="cursor-pointer font-semibold">Saldo según Lentia · {clp(registrado.saldo)}</summary>
      <dl className="mt-3 grid gap-2 text-sm"><div className="flex justify-between gap-2 text-emerald-300"><dt>Ingresos máquina (débito y crédito)</dt><dd>+{clp(registrado.maquina)}</dd></div><div className="flex justify-between gap-2 text-emerald-300"><dt>Transferencias recibidas</dt><dd>+{clp(registrado.transferencias)}</dd></div><div className="flex justify-between gap-2 text-red-300"><dt>Salidas netas registradas</dt><dd>{clp(registrado.salidas)}</dd></div><div className="flex justify-between gap-2 text-red-300"><dt>Comisiones estimadas</dt><dd>{clp(registrado.comisiones)}</dd></div></dl>
      <p className="mt-3 text-xs text-white/75">Incluye cobros registrados en Lentia. La máquina puede liquidar después; transferencias o gastos sin registrar pueden producir diferencias.</p>
    </details>}
    <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
      <Link href="/caja/mercadopago" className="rounded-xl border border-white/40 px-3 py-2">Cobros y vouchers →</Link>
      {saldo.estado !== 'disponible' && <a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/40 px-3 py-2">Ver saldo en Mercado Pago ↗</a>}
    </div>
  </section>;
}
