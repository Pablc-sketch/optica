'use server';

import { revalidatePath } from 'next/cache';
import { requerirPerfil, SinPermiso } from '@/lib/autorizacion';
import { hoyEnChile } from '@/lib/fechas';
import { validarRevision, type MovimientoRevision } from '@/lib/revision-financiera';

export async function revisarMovimiento(input: { movimiento: MovimientoRevision; accion: 'crear' | 'guardar' | 'confirmar'; motivo: string }) {
  try {
    const { supabase } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
    const m = input.movimiento;
    if (!['gastos_globales','retiros_sueldo'].includes(m.tabla) || !['crear','guardar','confirmar'].includes(input.accion)
      || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(m.id)
      || !Number.isSafeInteger(m.revision_version) || m.revision_version < 0
      || !input.motivo.trim() || input.motivo.length > 250) return { ok: false, error: 'Revisa los datos y el motivo.' };
    const invalido = input.accion === 'confirmar' ? null : validarRevision(m, hoyEnChile());
    if (invalido) return { ok: false, error: invalido };
    const { error } = await supabase.rpc('revisar_movimiento_financiero', {
      p_tabla: m.tabla, p_id: m.id, p_version: m.revision_version, p_accion: input.accion,
      p_datos: { fecha: m.fecha, monto: m.monto, caja: m.caja, operativo_id: m.operativo_id,
        descripcion: m.descripcion, categoria: m.categoria, persona: m.persona, motivo: m.motivo, es_sueldo: m.es_sueldo },
      p_motivo: input.motivo.trim(),
    });
    if (error) return { ok: false, error: error.code === '23505' ? 'Este registro ya existe. Recarga y revísalo antes de volver a agregarlo.' : error.code === 'P0001' ? error.message : 'No se pudo guardar. Recarga y revisa el historial antes de reintentar.' };
    for (const path of ['/', '/caja', '/reportes', '/pagos', '/pagos/revisar', '/operativos']) revalidatePath(path);
    revalidatePath('/operativos/[id]/cierre', 'page');
    revalidatePath('/operativos/[id]', 'page');
    return { ok: true };
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
}
