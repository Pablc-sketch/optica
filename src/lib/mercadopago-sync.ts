import 'server-only';
import { randomUUID } from 'node:crypto';
import { consultarApiMP, ErrorMercadoPago } from '@/lib/mercadopago-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { idMercadoPago, normalizarPagoMercadoPago, PagoMPInvalido, titularMercadoPago } from '@/lib/mercadopago-datos';

export function mercadoPagoConfigurado(tenant: string) {
  return Boolean(tenant && process.env.MERCADOPAGO_ACCESS_TOKEN && tenant === process.env.MERCADOPAGO_TENANT_ID);
}

export async function sincronizarMercadoPago(tenant: string) {
  if (!mercadoPagoConfigurado(tenant)) return { estado: 'no_configurado' as const, guardados: 0 };
  const db = createAdminClient();
  const run = randomUUID();
  const { data: inicio, error: errorInicio } = await db.rpc('mercadopago_iniciar_sync', { p_tenant: tenant, p_run: run });
  if (errorInicio) throw new Error('No se pudo iniciar la sincronización');
  if (!inicio) return { estado: 'en_curso' as const, guardados: 0 };
  let collector: string | null = null;
  const hasta = new Date();
  let fase = 'INICIO';
  const consultar = consultarApiMP;
  try {
    const { data: anterior, error } = await db.from('mercadopago_sync').select('ultima_correcta,collector_id').eq('tenant_id', tenant).single();
    if (error) throw new Error('No se pudo leer la sincronización');
    fase = 'CUENTA';
    collector = idMercadoPago((await consultar('/users/me')).id);
    if (!collector || (anterior.collector_id && anterior.collector_id !== collector)) throw new Error('La cuenta del proveedor cambió');
    if (!anterior.collector_id) {
      const { error } = await db.from('mercadopago_sync').update({ collector_id: collector })
        .eq('tenant_id', tenant).eq('run_id', run);
      if (error) throw new Error('No se pudo verificar el titular');
    }
    const desde = anterior.ultima_correcta
      ? new Date(Date.parse(anterior.ultima_correcta) - 86400000)
      : new Date(hasta.getTime() - 364 * 86400000);
    let guardados = 0;
    let completo = false;
    // Ventana fija y orden ascendente. El checkpoint avanza solo cuando todas
    // las páginas quedaron guardadas. Reintentar hace upsert, jamás cobra.
    fase = 'PAGOS';
    for (let offset = 0; offset < 10000; offset += 100) {
      const query = new URLSearchParams({ sort: 'date_last_updated', criteria: 'asc', limit: '100', offset: String(offset),
        range: 'date_last_updated', begin_date: desde.toISOString(), end_date: hasta.toISOString() });
      const json = await consultar(`/v1/payments/search?${query}`);
      const paging = json.paging as { total?: unknown } | undefined;
      if (!Array.isArray(json.results) || !Number.isSafeInteger(paging?.total) || (paging!.total as number) < 0) throw new Error('Página de pagos inválida');
      fase = 'FORMATO_PAGOS';
      const filas=[];
      for(const resumen of json.results){
        let pago;
        try{pago=normalizarPagoMercadoPago(resumen,collector!);}
        catch{
          // Search puede entregar un resumen incompleto. Se consulta el pago
          // individual; nunca completar datos monetarios por suposición.
          const id=idMercadoPago((resumen as Record<string,unknown>)?.id);
          if(!id)throw new PagoMPInvalido('ID');
          fase='DETALLE_PAGO';
          const detalle=await consultar(`/v1/payments/${id}`);
          // Search también puede incluir pagos enviados a otro receptor. No
          // son cobros de la óptica y no deben bloquear el archivo de ingresos.
          const receptor=titularMercadoPago(detalle);
          if(receptor&&receptor!==collector)continue;
          pago=normalizarPagoMercadoPago(detalle,collector!);
        }
        if(pago)filas.push({...pago,tenant_id:tenant,guardado_en:new Date().toISOString()});
      }
      fase = 'GUARDAR_PAGOS';
      if (filas.length) {
        const { error } = await db.from('mercadopago_pagos').upsert(filas, { onConflict: 'tenant_id,pago_id' });
        if (error) throw new Error('No se pudo guardar el archivo de pagos');
        guardados += filas.length;
      }
      fase = 'PAGOS';
      if (offset + json.results.length >= (paging!.total as number)) { completo = true; break; }
      if (json.results.length !== 100) throw new Error('Página de pagos incompleta');
    }
    if (!completo) throw new Error('Quedan páginas de pagos por consultar');
    fase = 'FINALIZAR';
    await db.from('mercadopago_sync').update({error_codigo:null}).eq('tenant_id',tenant).eq('run_id',run);
    const { data: fin, error: errorFin } = await db.rpc('mercadopago_finalizar_sync', {
      p_tenant: tenant, p_run: run, p_collector: collector, p_hasta: hasta.toISOString(),
    });
    if (errorFin || !fin) throw new Error('No se pudo confirmar la sincronización');
    return { estado: 'correcto' as const, guardados };
  } catch (e) {
    const codigo = `${fase}_${e instanceof ErrorMercadoPago || e instanceof PagoMPInvalido ? e.codigo : 'ERROR'}`;
    await db.from('mercadopago_sync').update({error_codigo:codigo}).eq('tenant_id',tenant).eq('run_id',run);
    await db.rpc('mercadopago_finalizar_sync', { p_tenant: tenant, p_run: run, p_collector: null, p_hasta: null });
    throw new Error('No se pudo sincronizar Mercado Pago. Los pagos guardados se conservan; se reintentará automáticamente.');
  }
}
