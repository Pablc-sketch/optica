'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requerirPerfil, SinPermiso } from '@/lib/autorizacion';
import { resumirCaja } from '@/lib/caja';
import { montoCaja } from '@/lib/caja-fuentes';
import { hoyEnChile } from '@/lib/fechas';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import { uuidAgenda } from '@/lib/agenda-terreno';
import { CATEGORIAS_CAJA } from '@/lib/caja-operativo';

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
  for (const ruta of ['/','/caja','/reportes','/gastos','/operativos/chequeos']) revalidatePath(ruta);
  const volver = String(f.get('volver_chequeo') ?? '');
  if (uuidAgenda.test(volver)) redirect(`/caja?chequeo=${volver}&guardado=1`);
  const operativo = String(f.get('volver_operativo') ?? '');
  if (uuidAgenda.test(operativo)) redirect(`/caja?operativo=${operativo}&guardado=1`);
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


export async function registrarGastoCajaOperativo(_: ResultadoCaja, f: FormData): Promise<ResultadoCaja> {
  const id = String(f.get('id') ?? '');
  const operativo = String(f.get('operativo_id') ?? '');
  const clave = String(f.get('clave') ?? '');
  const fecha = String(f.get('fecha') ?? '');
  const caja = String(f.get('caja') ?? '');
  const monto = montoCaja(f.get('monto'));
  if (!uuidAgenda.test(id) || !uuidAgenda.test(operativo) || monto === null ||
    !CATEGORIAS_CAJA.some(c => c.clave === clave) || !['efectivo', 'digital', 'personal'].includes(caja) ||
    !fechaValidaDocumento(fecha) || fecha > hoyEnChile()) {
    return { error: 'Revisa la sede, el monto, la fecha y de dónde salió el gasto.' };
  }

  try {
    const { supabase } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
    const { error } = await supabase.rpc('registrar_gasto_caja_operativo', {
      p_id: id, p_operativo: operativo, p_clave: clave, p_fecha: fecha, p_monto: monto, p_caja: caja,
    });
    if (error) return { error: error.code === '22023' ? 'Revisa los datos y que la sede siga disponible.' : 'No se pudo guardar el gasto. Revisa los movimientos antes de reintentar.' };
  } catch (error) {
    if (error instanceof SinPermiso) return { error: error.message };
    throw error;
  }

  for (const ruta of ['/', '/caja', '/gastos', '/reportes', '/pagos', '/pagos/revisar', '/impuestos', '/operativos',
    `/operativos/${operativo}`, `/operativos/${operativo}/cierre`]) revalidatePath(ruta);
  const volver = String(f.get('volver_chequeo') ?? '');
  if (uuidAgenda.test(volver)) redirect(`/caja?chequeo=${volver}&guardado=1#gastos`);
  if (f.get('volver_gastos') === '1') redirect(`/gastos?ver=historial&op=${operativo}&guardado=1`);
  const params = new URLSearchParams({ guardado: '1' });
  for (const sede of f.getAll('sede')) {
    if (typeof sede === 'string' && uuidAgenda.test(sede)) params.append('sede', sede);
  }
  redirect(`/caja?${params}`);
}


export async function confirmarSaldoBanco(_: ResultadoCaja, form: FormData): Promise<ResultadoCaja> {
  const { supabase, tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
  const id = String(form.get('id') ?? '');
  const chequeo = String(form.get('chequeo') ?? '');
  const operativo = String(form.get('operativo') ?? '');
  const monto = montoCaja(form.get('saldo'), true);
  if (!uuidAgenda.test(id) || !uuidAgenda.test(chequeo || operativo) || monto === null || monto > 999999999999) {
    return { error: 'Ingresa el saldo que ves en la cuenta.' };
  }
  const [totales, tenant] = await Promise.all([
    supabase.rpc('caja_global').single(),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id', tenantId).single(),
  ]);
  const t = totales.data as { entro_efectivo: number; salio_efectivo: number; entro_digital: number;
    entro_debito: number; entro_credito: number; salio_digital: number } | null;
  if (!t || totales.error || tenant.error) return { error: 'Lentia no pudo leer los movimientos actuales. Vuelve a intentar.' };
  const libro = resumirCaja({
    entroEfectivo: t.entro_efectivo, salioEfectivo: t.salio_efectivo, entroDigital: t.entro_digital,
    entroDebito: t.entro_debito, entroCredito: t.entro_credito, salioDigital: t.salio_digital,
  }, { comisionDebitoPct: Number(tenant.data.comision_debito_pct ?? 0), comisionCreditoPct: Number(tenant.data.comision_credito_pct ?? 0) });
  const { error } = await supabase.from('caja_saldos_confirmados')
    .insert({ id, tenant_id: tenantId, saldo: monto, saldo_registrado: libro.hayDigital });
  if (error && error.code !== '23505') return { error: 'No se pudo confirmar el saldo.' };
  revalidatePath('/caja');
  redirect(`/caja?${chequeo ? "chequeo" : "operativo"}=${chequeo || operativo}&guardado=1#saldos`);
}
