'use server';
import { revalidatePath } from 'next/cache';
import { requerirPerfil } from '@/lib/autorizacion';
import { sincronizarMercadoPago } from '@/lib/mercadopago-sync';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { createAdminClient } from '@/lib/supabase/admin';
import type { IdentidadAbonoMercadoPago } from '@/lib/mercadopago-datos';

export async function actualizarArchivoMercadoPago(): Promise<{ ok: boolean; mensaje: string }> {
  const { tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
  try {
    const r = await sincronizarMercadoPago(tenantId);
    revalidatePath('/configuracion/integraciones');
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
  revalidatePath(`/ventas/${input.identidad.venta_id}/comprobante`);
  return { ok: true, mensaje: 'Paciente confirmado. El voucher quedó protegido para este abono.' };
}
