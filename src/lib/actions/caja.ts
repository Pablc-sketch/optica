'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil } from '@/lib/autorizacion';
import { montoCaja } from '@/lib/caja-fuentes';
import { hoyEnChile } from '@/lib/fechas';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';

export type ResultadoCaja = { error?: string; guardado?: boolean };
export async function guardarMovimientoCaja(f: FormData): Promise<ResultadoCaja> {
  const { supabase, tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
  const tipo = String(f.get('tipo') ?? ''), caja = String(f.get('caja') ?? '');
  const monto = montoCaja(f.get('monto'), tipo === 'conteo');
  const descripcion = String(f.get('descripcion') ?? '').trim();
  const id = String(f.get('id') ?? '');
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || monto === null || descripcion.length > 250)
    return { error: 'Revisa el monto y la descripción.' };
  if (tipo === 'conteo') {
    const { error } = await supabase.rpc('registrar_conteo_caja', { p_id: id, p_contado: monto, p_nota: descripcion });
    if (error) return { error: 'No se pudo guardar el conteo. Vuelve a intentar.' };
    const { data: guardado, error: lectura } = await supabase.from('caja_conteos').select('contado,nota')
      .eq('tenant_id',tenantId).eq('id',id).maybeSingle();
    if (lectura || !guardado || guardado.contado !== monto || guardado.nota !== descripcion)
      return { error: 'No se pudo confirmar este conteo. Revisa el último registro antes de repetirlo.' };
  } else {
    const fecha = String(f.get('fecha') ?? '');
    if (!['deposito','retiro','devolucion'].includes(tipo) || !['digital','efectivo'].includes(caja)
      || !fechaValidaDocumento(fecha) || fecha > hoyEnChile() || !descripcion)
      return { error: 'Revisa la fecha, el origen y la descripción.' };
    const gastoId = tipo === 'devolucion' ? String(f.get('gasto_id') ?? '') : null;
    if (tipo === 'devolucion') {
      const { data: gasto, error } = await supabase.from('gastos_globales').select('id').eq('tenant_id',tenantId).eq('id',gastoId).eq('caja','personal').maybeSingle();
      if (error || !gasto) return { error: 'Gasto personal no disponible.' };
    }
    const { error } = await supabase.from('caja_movimientos').insert({ id, tenant_id: tenantId, tipo, caja, fecha, monto, descripcion, gasto_id: gastoId });
    if (error) {
      if (error.code !== '23505') return { error: tipo === 'devolucion' ? 'No se pudo guardar: revisa el saldo pendiente y la fecha del gasto.' : 'No se pudo guardar el movimiento. Vuelve a intentar.' };
      const { data: anterior, error: lectura } = await supabase.from('caja_movimientos')
        .select('tipo,caja,fecha,monto,descripcion,gasto_id').eq('tenant_id',tenantId).eq('id',id).maybeSingle();
      if (lectura || !anterior || anterior.tipo !== tipo || anterior.caja !== caja || anterior.fecha !== fecha
        || anterior.monto !== monto || anterior.descripcion !== descripcion || anterior.gasto_id !== gastoId)
        return { error: 'Este registro ya existe con otros datos. Revisa el historial antes de agregar otro.' };
    }
  }
  for (const ruta of ['/','/caja','/reportes']) revalidatePath(ruta);
  return { guardado: true };
}
export async function registrarMovimientoCaja(_: ResultadoCaja, f: FormData): Promise<ResultadoCaja> {
  const resultado = await guardarMovimientoCaja(f);
  if (resultado.error) return resultado;
  redirect('/caja?guardado=1');
}
