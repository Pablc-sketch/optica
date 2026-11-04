import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { consultarSaldoMercadoPago } from '@/lib/mercadopago-saldo';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { clp } from '@/lib/clp';
export default async function CuentaBancaria({ tenantId, obligaciones, registrado }: { tenantId:string; obligaciones?:number; registrado?:{ saldo:number; maquina:number; transferencias:number; salidas:number; comisiones:number } }) {
  const configurado = mercadoPagoConfigurado(tenantId);
  const supabase = await createClient();
  const { data,error } = configurado ? await supabase.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenantId).maybeSingle() : { data:null,error:null };
  const saldo = !configurado?{estado:'sin_configurar' as const}:error?{estado:'error' as const}:await consultarSaldoMercadoPago(tenantId,data?.collector_id??null);
  return <section className="flex flex-col rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Cuenta bancaria (Mercado Pago)</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${saldo.estado==='disponible'?'bg-teal-300/15 text-teal-200':'bg-white/10 text-slate-200'}`}>{saldo.estado==='disponible'?'Verificado en Mercado Pago':'Sin saldo verificado'}</span></div>
    {saldo.estado==='disponible'?<><p className="mt-4 text-4xl font-bold tracking-tight tabular-nums">{clp(saldo.disponible)}</p><p className="mt-2 text-xs text-slate-300">Disponible · {new Date(saldo.consultadoEn).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</p>
      {obligaciones!==undefined && <p className="mt-4 rounded-xl bg-white/5 p-3 text-sm text-slate-200">Proyección al pagar pendientes y separar ahorro: <b className="text-white">{clp(saldo.disponible-obligaciones)}</b></p>}
    </>:<><p className="mt-4 text-4xl font-bold text-slate-300" aria-label="Saldo no verificado">—</p><p className="mt-2 text-sm text-slate-300">{saldo.estado==='sin_configurar'?'Conecta Mercado Pago en Configuración → Integraciones.':saldo.estado==='no_habilitado'?'Mercado Pago no habilitó la consulta de saldo.':'No se pudo consultar el saldo bancario.'}</p></>}
    {registrado && <details className="mt-4 rounded-xl border border-white/15 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-200">Estimación de Lentia · {clp(registrado.saldo)}</summary><dl className="mt-3 grid gap-2 text-slate-300"><div className="flex justify-between gap-3"><dt>Cobros con máquina</dt><dd>+{clp(registrado.maquina)}</dd></div><div className="flex justify-between gap-3"><dt>Transferencias recibidas</dt><dd>+{clp(registrado.transferencias)}</dd></div><div className="flex justify-between gap-3"><dt>Salidas netas registradas</dt><dd>{clp(registrado.salidas)}</dd></div><div className="flex justify-between gap-3"><dt>Comisiones estimadas</dt><dd>{clp(registrado.comisiones)}</dd></div></dl><p className="mt-3 text-xs leading-relaxed text-slate-300">Es un cálculo con los movimientos registrados. Puede diferir del banco por liquidaciones, comisiones y movimientos faltantes.</p></details>}
    <div className="mt-auto flex flex-wrap gap-4 pt-5 text-sm font-semibold"><Link href="/caja/mercadopago" className="text-teal-200 underline underline-offset-4">Cobros y vouchers →</Link><a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer" className="text-slate-200 underline underline-offset-4">Abrir Mercado Pago ↗</a></div>
  </section>;
}
