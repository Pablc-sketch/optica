import CabeceraPagina from "@/components/cabecera-pagina";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirRolPagina } from '@/lib/autorizacion';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { estadoPagoMercadoPago } from '@/lib/mercadopago-caja';
import { ESTADOS_CONCILIACION } from '@/lib/mercadopago-datos';
import { clp } from '@/lib/clp';
import { diaEnChile, fechaLegible } from '@/lib/fechas';
import ActualizarMercadoPago from '@/components/actualizar-mercadopago';
import ConfirmarPacienteMercadoPago from '@/components/confirmar-paciente-mercadopago';

export default async function ArchivoMercadoPago({ searchParams }: { searchParams: Promise<{ pagina?: string; operacion?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  if (!mercadoPagoConfigurado(tenantId)) notFound();
  const params = await searchParams;
  const pagina = Math.min(10000, Math.max(1, Number.parseInt(params.pagina ?? '1', 10) || 1));
  const operacion = /^[0-9]{1,30}$/.test(params.operacion ?? '') ? params.operacion! : '';
  let consulta = supabase.from('mercadopago_conciliacion')
    .select('pago_id,fecha,monto,monto_devuelto,estado,conciliacion,abono_id,venta_id,paciente_id,paciente_nombre,paciente_rut,fecha_abono,medio_abono,confirmado_en,paciente_nombre_confirmado', { count: 'exact' })
    .eq('tenant_id', tenantId).order('fecha', { ascending: false }).order('pago_id', { ascending: false });
  if (operacion) consulta = consulta.eq('pago_id', operacion);
  const [archivo, sync] = await Promise.all([
    consulta.range((pagina - 1) * 50, pagina * 50 - 1),
    supabase.from('mercadopago_sync').select('ultima_correcta,estado,ultimo_intento').eq('tenant_id', tenantId).maybeSingle(),
  ]);
  const fecha = (valor: string) => new Date(valor).toLocaleString('es-CL', { timeZone: 'America/Santiago' });
  const enlacePagina = (n: number) => `?pagina=${n}${operacion ? `&operacion=${operacion}` : ''}`;
  return <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <Link href="/caja/mercadopago" className="text-sm underline">← Caja Mercado Pago</Link>
    <CabeceraPagina seccion="Integraciones" titulo="Vouchers de Mercado Pago" />
    <p className="text-sm text-tinta-suave">Busca la operación y coteja el original para confirmar al paciente.</p>
    <section className="rounded-2xl bg-white p-4 shadow-sm text-sm">
      <p>Pagos guardados automáticamente cada 5 min.</p>
      <p>Última actualización: {sync.data?.ultima_correcta ? fecha(sync.data.ultima_correcta) : 'Pendiente de la primera consulta'}</p>
      {sync.data?.estado === 'error' && <p className="mt-1 text-amber-800">La última consulta falló. Se conservan los respaldos anteriores y se reintentará automáticamente.</p>}
      {sync.data?.estado === 'sincronizando' && <p>Actualización en curso…</p>}
      <ActualizarMercadoPago />
    </section>
    <form className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">Número de operación completo
        <input name="operacion" defaultValue={operacion} inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} className="rounded-lg border bg-white px-3 py-2" />
      </label>
      <button className="rounded-lg border px-3 py-2 text-sm">Buscar</button>
      {operacion && <Link href="/configuracion/integraciones/mercadopago" className="p-2 text-sm underline">Ver todas</Link>}
    </form>
    {archivo.error || sync.error ? <p role="alert">No se pudo leer el archivo. Vuelve a intentar.</p> : <>
      <p className="text-sm">{archivo.count ?? 0} operaciones guardadas · página {pagina}</p>
      <ul className="divide-y rounded-2xl bg-white px-4 shadow-sm">
        {(archivo.data ?? []).map(p => <li key={p.pago_id} className="py-4 text-sm">
          <div className="flex justify-between gap-2"><b>Operación {p.pago_id}</b><b>{clp(p.monto)}</b></div>
          <p>{fechaLegible(diaEnChile(p.fecha))} · {estadoPagoMercadoPago(p.estado)}</p>
          <p className={p.conciliacion === 'vinculado' ? 'text-emerald-800' : 'text-amber-800'}>{ESTADOS_CONCILIACION[p.conciliacion] ?? 'Pendiente de revisión'}</p>
          {p.monto_devuelto > 0 && <p>Devuelto: {clp(p.monto_devuelto)}. Revisar el abono de caja.</p>}
          {p.venta_id && <Link href={`/ventas/${p.venta_id}/comprobante`} className="mt-1 inline-block underline">{p.paciente_nombre ?? 'Compra sin paciente'} · Ver compra y abonos</Link>}
          {p.confirmado_en && <p className="mt-1 text-xs">Cotejado el {fecha(p.confirmado_en)} para {p.paciente_nombre_confirmado}.</p>}
          {p.conciliacion === 'confirmar_paciente' && p.abono_id && p.venta_id && p.paciente_id && p.paciente_nombre && p.paciente_rut && p.fecha_abono && p.medio_abono && <ConfirmarPacienteMercadoPago
            pagoId={p.pago_id} abonoId={p.abono_id} identidad={{ venta_id: p.venta_id, paciente_id: p.paciente_id, paciente_nombre: p.paciente_nombre,
              paciente_rut: p.paciente_rut, monto: p.monto, medio_pago: p.medio_abono, fecha_abono: p.fecha_abono }} />}
          {p.conciliacion === 'sin_abono' && <p className="mt-1 text-xs text-tinta-suave">Anota esta operación completa en el abono de la compra correcta. No se asigna un paciente por el importe.</p>}
        </li>)}
      </ul>
      {archivo.data?.length === 0 && <p className="text-sm">No hay operaciones guardadas para esta búsqueda.</p>}
      <nav aria-label="Páginas del archivo" className="flex justify-between text-sm">
        {pagina > 1 ? <Link href={enlacePagina(pagina - 1)} className="underline">← Anterior</Link> : <span />}
        {(archivo.count ?? 0) > pagina * 50 && <Link href={enlacePagina(pagina + 1)} className="underline">Siguiente →</Link>}
      </nav>
    </>}
  </div>;
}
