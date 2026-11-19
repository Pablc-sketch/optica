'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil } from '@/lib/autorizacion';
import { montoCaja } from '@/lib/caja-fuentes';
import { hoyEnChile } from '@/lib/fechas';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';

export type ResultadoCaja = { error?: string };
export async function registrarMovimientoCaja(_: ResultadoCaja, f: FormData): Promise<ResultadoCaja> {
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
  } else {
    const fecha = String(f.get('fecha') ?? '');
    if (!['deposito','retiro','devolucion'].includes(tipo) || !['digital','efectivo'].includes(caja)
      || !fechaValidaDocumento(fecha) || fecha > hoyEnChile() || !descripcion)
      return { error: 'Revisa la fecha, el origen y la descripción.' };
    const gastoId = tipo === 'devolucion' ? String(f.get('gasto_id') ?? '') : null;
    if (tipo === 'devolucion') {
      const { data: gasto, error } = await supabase.from('gastos_globales').select('id,monto_estimado').eq('tenant_id',tenantId).eq('id',gastoId).eq('caja','personal').maybeSingle();
      if (error || !gasto) return { error: 'Gasto personal no disponible.' };
      if(gasto.monto_estimado)return {error:'Confirma primero el importe exacto del gasto personal.'};
    }
    const { error } = await supabase.from('caja_movimientos').insert({ id, tenant_id: tenantId, tipo, caja, fecha, monto, descripcion, gasto_id: gastoId });
    if (error && error.code !== '23505') return { error: tipo === 'devolucion' ? 'No se pudo guardar: revisa el saldo pendiente y la fecha del gasto.' : 'No se pudo guardar el movimiento. Vuelve a intentar.' };
  }
  for (const ruta of ['/','/caja','/reportes']) revalidatePath(ruta);
  redirect(f.get('volver_gastos')==='1'?'/gastos?guardado=1#adelantos-personales':'/caja?guardado=1');
}

export async function confirmarImportePersonal(f:FormData){
 const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
 const id=String(f.get('gasto_id')??'');const monto=montoCaja(f.get('monto'));
 if(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)||monto===null)throw new Error('Revisa el importe exacto del comprobante.');
 const {error}=await supabase.from('gastos_globales').update({monto,monto_estimado:false}).eq('id',id).eq('tenant_id',tenantId).eq('caja','personal').eq('monto_estimado',true);
 if(error)throw new Error('No se pudo confirmar el importe. Revisa las devoluciones registradas.');
 for(const ruta of ['/caja','/gastos','/pagos','/reportes'])revalidatePath(ruta);
 redirect(f.get('volver_gastos')==='1'?'/gastos?guardado=1#adelantos-personales':'/caja?ver=cuadrar&guardado=1#reintegros');
}

export async function guardarNotaGasto(f:FormData){
 const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
 const id=String(f.get('gasto_id')??'');const nota=String(f.get('nota')??'').trim();
 if(!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id)||nota.length>1000)throw new Error('Revisa la nota del gasto.');
 const {data,error}=await supabase.from('gastos_globales').update({nota}).eq('id',id).eq('tenant_id',tenantId).select('id').maybeSingle();
 if(error||!data)throw new Error('No se pudo guardar la nota del gasto.');
 revalidatePath('/gastos');revalidatePath('/caja');
 redirect('/gastos?guardado=1#adelantos-personales');
}
