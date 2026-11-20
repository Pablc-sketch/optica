import Link from 'next/link';
import {clp} from '@/lib/clp';
import type {SaldoMercadoPago} from '@/lib/mercadopago-saldo';
export default function SaldoCaja({saldo,efectivo}:{saldo:SaldoMercadoPago;efectivo:number|null}){
 const conocido=saldo.estado==='disponible'||saldo.estado==='reporte';
 const vigente=saldo.estado==='disponible'||saldo.estado==='reporte'&&saldo.vigente;
 const total=conocido&&efectivo!==null?saldo.disponible+efectivo:null;
 const fecha=conocido?(saldo.estado==='reporte'?saldo.hasta:saldo.consultadoEn):null;
 return <section aria-label="Saldo real de caja" className="rounded-2xl bg-tinta p-5 text-white sm:p-6">
  <h2 className="text-lg font-semibold">Saldo de caja</h2><p className="mt-1 text-sm text-white/85">{vigente?'Cuenta Mercado Pago + efectivo':'Último saldo de Mercado Pago + efectivo'}</p>
  <p className="mt-4 text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{total===null?'Por verificar':clp(total)}</p>
  <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/30 pt-4"><div><dt className="text-sm text-white/85">Mercado Pago</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{conocido?clp(saldo.disponible):'Por verificar'}</dd></div><div><dt className="text-sm text-white/85">Efectivo contado y movimientos</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{efectivo===null?'Por contar':clp(efectivo)}</dd></div></dl>
  {fecha&&<p className="mt-4 text-sm leading-relaxed text-white/85">{saldo.estado==='reporte'?'Reporte bancario':'Banco consultado'} · {new Date(fecha).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}{!vigente?' · pendiente de actualizar':''}</p>}
  {saldo.estado==='reporte'&&saldo.reportesPausados&&<p role="status" className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-medium text-amber-950">Consulta del saldo pausada para evitar correos repetidos. Los cobros siguen sincronizándose. <a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer" className="font-bold underline">Ver saldo actual en Mercado Pago ↗</a></p>}
  <Link href="/caja?ver=cuadrar" className="mt-4 inline-block min-h-11 rounded-xl border border-white/50 px-4 py-3 text-sm font-semibold">Verificar saldos</Link>
 </section>;
}
