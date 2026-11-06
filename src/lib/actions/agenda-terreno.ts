'use server';
import { revalidatePath } from 'next/cache';
import { requerirPerfil, SinPermiso } from '@/lib/autorizacion';
import { leerTurno, ROLES_AGENDA, uuidAgenda } from '@/lib/agenda-terreno';

export type ResultadoAgenda = { error?: string; mensaje?: string; href?: string };

export async function guardarTurno(datos: FormData): Promise<ResultadoAgenda> {
  try {
    const { supabase } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
    let entrada;
    try { entrada = leerTurno(datos); } catch (e) { return { error: (e as Error).message }; }
    const { error } = await supabase.rpc('agenda_guardar_turno', { p: entrada });
    if (error) return { error: error.code === '23514' ? error.message : error.code === '23P01'
      ? (error.message.includes('ya está asignado') ? error.message : 'Un recurso ya está reservado en ese horario.')
      : 'No pudimos guardar el operativo. Revisa los datos y vuelve a intentar.' };
    revalidatePath('/agenda/equipos');
    revalidatePath('/operativos', 'layout');
    revalidatePath('/ventas');
    revalidatePath('/');
    return { href: '/agenda/equipos?mes=' + entrada.fecha.slice(0,7) + '&dia=' + entrada.fecha };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

export async function guardarRecurso(datos: FormData): Promise<ResultadoAgenda> {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ['admin'], suscripcion: true });
    const id = String(datos.get('id') ?? ''), tipo = String(datos.get('tipo') ?? '');
    const nombre = String(datos.get('nombre') ?? '').trim(), detalle = String(datos.get('detalle') ?? '').trim();
    if (!nombre || nombre.length > 100 || detalle.length > 250 || (id && !uuidAgenda.test(id))
      || (!id && !Object.hasOwn(ROLES_AGENDA,tipo))) return { error: 'Revisa el nombre y el tipo.' };
    const { data, error } = await (id
      ? supabase.from('agenda_recursos').update({nombre,detalle}).eq('id',id).eq('tenant_id',tenantId)
      : supabase.from('agenda_recursos').insert({tipo,nombre,detalle})).select('id').maybeSingle();
    if (error || !data) return { error: error?.code === '23505' ? 'Ya hay un recurso con ese nombre y tipo.' : 'No pudimos guardar el recurso.' };
    revalidatePath('/agenda/equipos', 'layout');
    return { mensaje: 'Guardado' };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

export async function actualizarJornada(datos: FormData): Promise<ResultadoAgenda> {
  try {
    const { supabase,tenantId } = await requerirPerfil({ roles:['admin'],suscripcion:true });
    const id=String(datos.get('id') ?? ''), estado=String(datos.get('estado') ?? '');
    if (!uuidAgenda.test(id)) return {error:'Operativo no disponible.'};
    let cambios: Record<string,string|number> = {};
    if (estado) {
      if (!['planificado','realizado','cancelado'].includes(estado)) return {error:'Estado inválido.'};
      cambios = {estado};
    } else {
      for (const k of ['costo_transporte','costo_arriendo','costo_viaticos','costo_otros','costo_ayudante','costo_equipos']) {
        const v=String(datos.get(k) ?? '').trim();
        if (v && (!/^\d{1,9}$/.test(v))) return {error:'Ingresa los gastos en pesos enteros.'};
        cambios[k]=Number(v);
      }
    }
    const {data,error} = await supabase.from('operativos').update(cambios).eq('id',id).eq('tenant_id',tenantId).select('id').maybeSingle();
    if (!data || error) return {error:error?.code==='23P01' ? 'Hay personal o un kit reservado en ese horario.' : 'No se pudo actualizar el operativo.'};
    revalidatePath('/agenda/equipos','layout');
    revalidatePath('/operativos','layout');
    revalidatePath('/ventas');
    revalidatePath('/reportes');
    revalidatePath('/');
    return {mensaje:'Guardado'};
  } catch (e) {
    if (e instanceof SinPermiso) return {error:e.message};
    throw e;
  }
}
