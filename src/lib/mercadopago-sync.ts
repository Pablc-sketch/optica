import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { idMercadoPago, normalizarPagoMercadoPago } from '@/lib/mercadopago-datos';

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
  async function consultar(path: string): Promise<Record<string, unknown>> {
    const r = await fetch(`https://api.mercadopago.com${path}`, {
      headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` },
      cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error',
    });
    if (!r.ok) throw new Error('No se pudo consultar Mercado Pago');
    const json: unknown = await r.json();
    if (!json || typeof json !== 'object') throw new Error('Respuesta inválida');
    return json as Record<string, unknown>;
  }
  try {
    const { data: anterior, error } = await db.from('mercadopago_sync').select('ultima_correcta,collector_id').eq('tenant_id', tenant).single();
    if (error) throw new Error('No se pudo leer la sincronización');
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
    for (let offset = 0; offset < 10000; offset += 100) {
      const query = new URLSearchParams({ sort: 'date_last_updated', criteria: 'asc', limit: '100', offset: String(offset),
        range: 'date_last_updated', begin_date: desde.toISOString(), end_date: hasta.toISOString() });
      const json = await consultar(`/v1/payments/search?${query}`);
      const paging = json.paging as { total?: unknown } | undefined;
      if (!Array.isArray(json.results) || !Number.isSafeInteger(paging?.total) || (paging!.total as number) < 0) throw new Error('Página de pagos inválida');
      const filas = json.results.map(p => normalizarPagoMercadoPago(p, collector!)).filter(p => p !== null)
        .map(p => ({ ...p, tenant_id: tenant, guardado_en: new Date().toISOString() }));
      if (filas.length) {
        const { error } = await db.from('mercadopago_pagos').upsert(filas, { onConflict: 'tenant_id,pago_id' });
        if (error) throw new Error('No se pudo guardar el archivo de pagos');
        guardados += filas.length;
      }
      if (offset + json.results.length >= (paging!.total as number)) { completo = true; break; }
      if (json.results.length !== 100) throw new Error('Página de pagos incompleta');
    }
    if (!completo) throw new Error('Quedan páginas de pagos por consultar');
    const { data: fin, error: errorFin } = await db.rpc('mercadopago_finalizar_sync', {
      p_tenant: tenant, p_run: run, p_collector: collector, p_hasta: hasta.toISOString(),
    });
    if (errorFin || !fin) throw new Error('No se pudo confirmar la sincronización');
    return { estado: 'correcto' as const, guardados };
  } catch {
    await db.rpc('mercadopago_finalizar_sync', { p_tenant: tenant, p_run: run, p_collector: null, p_hasta: null });
    throw new Error('No se pudo sincronizar Mercado Pago. Los pagos guardados se conservan; se reintentará automáticamente.');
  }
}
