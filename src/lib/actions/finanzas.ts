'use server';

import { revalidatePath } from 'next/cache';
import { requerirPerfil, SinPermiso } from '@/lib/autorizacion';
import { hoyEnChile } from '@/lib/fechas';
import { prepararRegistroFinanzas } from '@/lib/finanzas';
import { guardarMovimientoCaja } from './caja';

export type ResultadoFinanzas = { error?: string; guardado?: boolean; id?: string };
export async function guardarRegistroFinanzas(_: ResultadoFinanzas, f: FormData): Promise<ResultadoFinanzas> {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
    const tipo = String(f.get('tipo') ?? '');
    if (['traslado','conteo','devolucion'].includes(tipo)) {
      const datos = new FormData();
      for (const [k,v] of f) datos.set(k,v);
      if (tipo === 'traslado') {
        const direccion = String(f.get('direccion') ?? '');
        if (!['deposito','retiro'].includes(direccion)) return { error: 'Elige entre qué cuentas moviste el dinero.' };
        datos.set('tipo',direccion);
        datos.set('caja','digital');
      }
      return await guardarMovimientoCaja(datos);
    }
    const preparado = prepararRegistroFinanzas(f,hoyEnChile());
    if ('error' in preparado) return preparado;
    const m = preparado.movimiento;
    const { error } = await supabase.rpc('revisar_movimiento_financiero', {
      p_tabla: m.tabla, p_id: m.id, p_version: 0, p_accion: 'crear',
      p_datos: { fecha:m.fecha,monto:m.monto,caja:m.caja,operativo_id:m.operativo_id,
        descripcion:m.descripcion,categoria:m.categoria,persona:m.persona,motivo:m.motivo,es_sueldo:m.es_sueldo },
      p_motivo: 'Registro desde Finanzas',
    });
    if (error) {
      if (error.code !== '23505') return { error: error.code === 'P0001' ? error.message : 'No se pudo guardar. Tus datos siguen en el formulario; revisa el historial antes de reintentar.' };
      // Si se perdió la respuesta después de guardar, reintentar el MISMO
      // registro no duplica el gasto. Nunca aceptar una colisión diferente.
      const { data: previo, error: lectura } = await supabase.from(m.tabla).select('*')
        .eq('id',m.id).eq('tenant_id',tenantId).maybeSingle();
      const claves = m.tabla === 'gastos_globales'
        ? ['fecha','monto','caja','operativo_id','descripcion','categoria'] as const
        : ['fecha','monto','caja','operativo_id','persona','motivo','es_sueldo'] as const;
      if (lectura || !previo || !claves.every(k => (previo[k] ?? null) === (m[k] ?? null)))
        return { error: 'Este registro ya existe con otros datos. Revísalo en Movimientos.' };
    }
    for (const ruta of ['/','/caja','/pagos','/pagos/revisar','/reportes']) revalidatePath(ruta);
    if (m.operativo_id) revalidatePath(`/operativos/${m.operativo_id}/cierre`);
    return { guardado:true, id:m.id };
  } catch (e) {
    if (e instanceof SinPermiso) return { error:e.message };
    // Las redirecciones de autenticación deben conservar su comportamiento.
    if (e && typeof e === 'object' && 'digest' in e) throw e;
    return { error:'No se pudo confirmar el guardado. Revisa Movimientos antes de volver a agregarlo.' };
  }
}
