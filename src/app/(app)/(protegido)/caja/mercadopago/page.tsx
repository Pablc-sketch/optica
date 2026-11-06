import CabeceraPagina from "@/components/cabecera-pagina";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirRolPagina } from '@/lib/autorizacion';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { consultarSaldoMercadoPago } from '@/lib/mercadopago-saldo';
import { filtrosCajaMercadoPago, estadoPagoMercadoPago } from '@/lib/mercadopago-caja';
import { ESTADOS_CONCILIACION } from '@/lib/mercadopago-datos';
import { clp } from '@/lib/clp';
import { diaEnChile, fechaLegible, inicioDelDia, finDelDia } from '@/lib/fechas';
import ActualizarCajaMercadoPago from '@/components/actualizar-caja-mercadopago';
export const maxDuration = 60;

type Params = { desde?: string; hasta?: string; operacion?: string; ver?: string; pagina?: string };
export default async function CajaMercadoPago({ searchParams }: { searchParams: Promise<Params> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  if (!mercadoPagoConfigurado(tenantId)) notFound();
  const f = filtrosCajaMercadoPago(await searchParams);
  const desde = inicioDelDia(f.desde), hasta = finDelDia(f.hasta);
  let consulta = supabase.from('mercadopago_conciliacion')
    .select('pago_id,fecha,monto,monto_devuelto,estado,conciliacion,venta_id,paciente_nombre', { count: 'exact' })
    .eq('tenant_id',tenantId).gte('fecha',desde).lte('fecha',hasta)
    .order('fecha',{ascending:false}).order('pago_id',{ascending:false});
  if (f.operacion) consulta = consulta.eq('pago_id',f.operacion);
  if (f.ver === 'pendientes') consulta = consulta.neq('conciliacion','vinculado');
  const syncPromesa = Promise.resolve(supabase.from('mercadopago_sync').select('collector_id,estado,ultima_correcta').eq('tenant_id',tenantId).maybeSingle());
  const [archivo, resumen, sync, saldo] = await Promise.all([
    consulta.range((f.pagina-1)*25,f.pagina*25-1),
    supabase.rpc('mercadopago_resumen_caja',{p_desde:desde,p_hasta:hasta}).single(),
    syncPromesa,
    Promise.resolve(syncPromesa).then(s => consultarSaldoMercadoPago(tenantId,s.data?.collector_id ?? null)),
  ]);
  const datos = resumen.data as { operaciones: number; cobros: number; por_revisar: number; devuelto: number } | null;
  const hora = (v: string) => new Date(v).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'});
  const enlace = (cambio: Partial<typeof f>) => '/caja/mercadopago?' + new URLSearchParams({ ...f, pagina:'1',...cambio, ...('pagina' in cambio ? {pagina:String(cambio.pagina)} : {}) } as Record<string,string>).toString();
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><CabeceraPagina seccion="Cuenta bancaria" titulo="Mercado Pago" /><Link href="/caja" className="mt-1 inline-block text-sm underline">Efectivo, gastos y pagos pendientes →</Link></div>
      <ActualizarCajaMercadoPago />
    </div>
    <section className="rounded-2xl bg-tinta p-5 text-white shadow-sm" aria-label="Saldo de la cuenta">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-sm font-semibold text-white/80">Saldo disponible en la cuenta</h2>
          {saldo.estado === 'disponible' ? <><p className="mt-1 text-4xl font-bold tabular-nums">{clp(saldo.disponible)}</p>
            <p className="mt-2 text-xs text-white/75">Consultado {hora(saldo.consultadoEn)} · Total {clp(saldo.total)}</p></>
            : <><p className="mt-2 text-lg font-semibold">{saldo.estado === 'no_habilitado' ? 'Consulta de saldo no habilitada' : saldo.estado === 'no_configurado' ? 'Pendiente de verificar la cuenta' : 'Saldo no disponible en esta consulta'}</p>
              <p className="mt-1 text-sm text-white/80">Consulta el saldo en Mercado Pago. Los cobros guardados aparecen abajo.</p></>}
        </div>
        <a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold hover:bg-white/10">Abrir cuenta ↗</a>
      </div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-tinta-suave">
      <p>{sync.data?.ultima_correcta ? `Pagos sincronizados: ${hora(sync.data.ultima_correcta)}` : 'Primera sincronización pendiente'} · cada 5 min</p>
      <Link href="/configuracion/integraciones/mercadopago" className="underline underline-offset-4">Archivo de vouchers →</Link>
    </div>
    {sync.error || sync.data?.estado === 'error' ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">La última consulta de pagos falló. Se muestran los datos guardados. Usa Actualizar ahora.</p>
      : sync.data?.estado === 'sincronizando' && <p role="status" className="text-sm">Sincronización en curso…</p>}
    <form action="/caja/mercadopago" className="grid grid-cols-2 items-end gap-3 rounded-2xl bg-white p-4 shadow-sm sm:grid-cols-[1fr_1fr_1.4fr_auto]">
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">Desde<input type="date" name="desde" defaultValue={f.desde} required className="min-w-0 rounded-xl border px-3 py-2.5" /></label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">Hasta<input type="date" name="hasta" defaultValue={f.hasta} required className="min-w-0 rounded-xl border px-3 py-2.5" /></label>
      <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">Operación<input type="search" name="operacion" inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} defaultValue={f.operacion} placeholder="Número completo" className="min-w-0 rounded-xl border px-3 py-2.5" /></label>
      <input type="hidden" name="ver" value={f.ver} />
      <button className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Buscar</button>
    </form>
    {resumen.error || !datos ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">No se pudo cargar el resumen del período.</p> : <section aria-label="Resumen del período" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-xs font-semibold text-tinta-suave">Cobros aprobados del período</h2><p className="mt-1 text-2xl font-bold tabular-nums">{clp(datos.cobros)}</p><p className="mt-1 text-xs text-tinta-suave">Antes de comisiones · no es saldo bancario</p></div>
      <div className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-xs font-semibold text-tinta-suave">Operaciones</h2><p className="mt-1 text-2xl font-bold tabular-nums">{datos.operaciones}</p>{datos.devuelto > 0 && <p className="text-xs text-amber-800">Devuelto: {clp(datos.devuelto)}</p>}</div>
      <Link href={enlace({ver:'pendientes'})} className="col-span-2 rounded-2xl bg-amber-50 p-4 text-amber-900 sm:col-span-1"><h2 className="text-xs font-semibold">Por revisar</h2><p className="mt-1 text-2xl font-bold tabular-nums">{datos.por_revisar} <span className="text-sm">→</span></p></Link>
    </section>}
    <section aria-label="Operaciones del período">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Operaciones</h2>
        <nav aria-label="Filtrar operaciones" className="flex gap-1 rounded-full bg-white p-1 text-sm">
          <Link href={enlace({ver:'todos'})} aria-current={f.ver === 'todos' ? 'page' : undefined} className={`rounded-full px-3 py-2 ${f.ver === 'todos' ? 'bg-tinta text-white' : ''}`}>Todas</Link>
          <Link href={enlace({ver:'pendientes'})} aria-current={f.ver === 'pendientes' ? 'page' : undefined} className={`rounded-full px-3 py-2 ${f.ver === 'pendientes' ? 'bg-tinta text-white' : ''}`}>Por revisar</Link>
        </nav>
      </div>
      {archivo.error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">No se pudieron cargar las operaciones. Actualiza para reintentar.</p>
        : archivo.data?.length === 0 ? <div className="rounded-2xl bg-white p-6 text-center shadow-sm"><p>Sin operaciones para estos filtros.</p><Link href="/caja/mercadopago" className="mt-2 inline-block text-sm underline">Restablecer filtros</Link></div>
        : <ul className="divide-y divide-tinta/10 rounded-2xl bg-white px-4 shadow-sm">{archivo.data?.map(p => <li key={p.pago_id} className="py-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">#{p.pago_id}</span><span className="text-lg font-bold tabular-nums">{clp(p.monto)}</span></div>
          <p className="text-xs text-tinta-suave">{fechaLegible(diaEnChile(p.fecha))} · {estadoPagoMercadoPago(p.estado)}</p>
          <p className={`mt-1 text-xs ${p.conciliacion === 'vinculado' ? 'text-emerald-800' : 'text-amber-800'}`}>{ESTADOS_CONCILIACION[p.conciliacion] ?? 'Pendiente de revisión'}</p>
          {p.monto_devuelto > 0 && <p className="mt-1 text-xs text-red-800">Devuelto: {clp(p.monto_devuelto)}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {p.venta_id && <Link href={`/ventas/${p.venta_id}/comprobante`} className="font-semibold underline underline-offset-4">{p.paciente_nombre ?? 'Ver compra'}</Link>}
            <Link href={`/configuracion/integraciones/mercadopago?operacion=${p.pago_id}`} className="text-tinta-suave underline underline-offset-4">Ver voucher</Link>
          </div>
        </li>)}</ul>}
      {!archivo.error && <nav aria-label="Páginas de operaciones" className="mt-3 flex items-center justify-between gap-2 text-sm">
        <span>{archivo.count ?? 0} operaciones · página {f.pagina}</span><div className="flex gap-2">
          {f.pagina > 1 && <Link href={enlace({pagina:f.pagina-1})} className="rounded-xl border bg-white px-3 py-2">Anterior</Link>}
          {(archivo.count ?? 0) > f.pagina*25 && <Link href={enlace({pagina:f.pagina+1})} className="rounded-xl border bg-white px-3 py-2">Siguiente</Link>}
        </div>
      </nav>}
    </section>
  </div>;
}
