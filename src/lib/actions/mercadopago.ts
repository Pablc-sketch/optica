'use server';
import {actualizarSaldoPorReporte} from '@/lib/mercadopago-reportes';
import { sincronizarOrdenesPoint } from '@/lib/mercadopago-point';
import { revalidatePath } from 'next/cache';
import { requerirPerfil } from '@/lib/autorizacion';
import { sincronizarMercadoPago } from '@/lib/mercadopago-sync';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import { cobrosMPCoincidentes, type IdentidadAbonoMercadoPago } from '@/lib/mercadopago-datos';
import { consultarApiMP } from '@/lib/mercadopago-api';
import { hoyEnChile, inicioDelDia } from '@/lib/fechas';

export async function actualizarArchivoMercadoPago(): Promise<{ ok: boolean; mensaje: string }> {
  const { tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
  try {
    const [archivo] = await Promise.allSettled([sincronizarMercadoPago(tenantId), sincronizarOrdenesPoint(tenantId), actualizarSaldoPorReporte(tenantId)]);
    if (archivo.status === 'rejected') throw new Error('Archivo de pagos pendiente');
    const r=archivo.value;
    revalidatePath('/configuracion/integraciones');
    revalidatePath('/configuracion/integraciones/mercadopago');
    revalidatePath('/caja/mercadopago');
    revalidatePath('/caja');
    revalidatePath('/cobros');
    return { ok: r.estado !== 'no_configurado', mensaje: r.estado === 'correcto' ? 'Archivo actualizado.' : r.estado === 'en_curso' ? 'La actualización ya está en curso.' : 'Esta óptica no tiene Mercado Pago vinculado.' };
  } catch {
    return { ok: false, mensaje: 'No se pudo actualizar. Se conservan los datos guardados y se reintentará automáticamente.' };
  }
}

export async function confirmarPacienteMercadoPago(input: {
  pagoId: string; abonoId: string; identidad: IdentidadAbonoMercadoPago;
  operacionEscrita: string; cotejado: boolean;
}): Promise<{ ok: boolean; mensaje: string }> {
  const { tenantId, user } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
  if (!mercadoPagoConfigurado(tenantId)) return { ok: false, mensaje: 'Esta óptica no tiene Mercado Pago vinculado.' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!/^[0-9]{8,30}$/.test(input.pagoId) || !uuid.test(input.abonoId)
    || !input.identidad || !uuid.test(input.identidad.venta_id) || !uuid.test(input.identidad.paciente_id)
    || input.cotejado !== true || input.operacionEscrita.trim() !== input.pagoId) {
    return { ok: false, mensaje: 'Coteja el comprobante original y escribe la operación completa para confirmar este paciente.' };
  }
  const { data, error } = await createAdminClient().rpc('mercadopago_confirmar_vinculo', {
    p_tenant: tenantId, p_actor: user.id, p_pago: input.pagoId, p_abono: input.abonoId, p_esperado: input.identidad,
  });
  if (error || data !== true) return { ok: false, mensaje: error?.code === '23514' ? error.message : 'No se pudo confirmar. Recarga y revisa que la operación no esté usada en otro abono.' };
  revalidatePath('/configuracion/integraciones/mercadopago');
  revalidatePath('/caja/mercadopago');
  revalidatePath(`/ventas/${input.identidad.venta_id}/comprobante`);
  return { ok: true, mensaje: 'Paciente confirmado. El voucher quedó protegido para este abono.' };
}

export async function buscarCobrosConTarjeta(monto: number, medio: string) {
  const { tenantId } = await requerirPerfil({ roles: ['admin', 'ventas', 'clinico'], suscripcion: true });
  if (!mercadoPagoConfigurado(tenantId) || !Number.isSafeInteger(monto) || monto <= 0 || !['debito','credito'].includes(medio)) {
    return { error: 'Revisa el monto y el medio del cobro.', cobros: [] };
  }
  try {
    const db = createAdminClient();
    const { data, error } = await db.from('mercadopago_sync').select('collector_id').eq('tenant_id', tenantId).single();
    if (error || !data?.collector_id) throw new Error('Cuenta no verificada');
    const hasta = Date.now();
    const desde = Math.min(Date.parse(inicioDelDia(hoyEnChile())), hasta - 60 * 60_000);
    const filtros = new URLSearchParams({
      sort: 'date_created', criteria: 'desc', range: 'date_created', limit: '100',
      begin_date: new Date(desde).toISOString(), end_date: new Date(hasta).toISOString(),
      status: 'approved', payment_type_id: medio === 'debito' ? 'debit_card' : 'credit_card',
    });
    const respuesta = await consultarApiMP(`/v1/payments/search?${filtros}`);
    if (!Array.isArray(respuesta.results)) throw new Error('Respuesta sin pagos');
    const candidatos = cobrosMPCoincidentes(respuesta.results, String(data.collector_id), medio, monto, desde, hasta);
    if (!candidatos.length) return { cobros: [] };
    const usados = await db.from('pagos_abonos').select('numero_voucher').eq('tenant_id', tenantId)
      .in('numero_voucher', candidatos.map(p => p.id));
    if (usados.error) throw new Error('No se pudieron revisar los abonos existentes');
    const vinculados = new Set((usados.data ?? []).map(p => p.numero_voucher));
    return { cobros: candidatos.filter(p => !vinculados.has(p.id)) };
  } catch {
    return { error: 'No se pudo consultar Mercado Pago. Reintenta la búsqueda sin volver a cobrar.', cobros: [] };
  }
}
