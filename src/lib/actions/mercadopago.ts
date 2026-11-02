'use server';
import { revalidatePath } from 'next/cache';
import { requerirPerfil } from '@/lib/autorizacion';
import { sincronizarMercadoPago } from '@/lib/mercadopago-sync';

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
