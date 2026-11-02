import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { rpc, from, upsert, single } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), upsert: vi.fn(), single: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc, from }) }));
import { sincronizarMercadoPago } from '../src/lib/mercadopago-sync';
import { POST } from '../src/app/api/integraciones/mercadopago/sync/route';

const pago = { id: 123456, collector_id: 123, currency_id: 'CLP', live_mode: true,
  transaction_amount: 19000, status: 'approved', payment_type_id: 'debit_card',
  date_created: '2026-10-30T10:00:00Z', date_last_updated: '2026-10-30T10:01:00Z' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'test-placeholder');
  vi.stubEnv('MERCADOPAGO_TENANT_ID', 'global');
  vi.stubEnv('MERCADOPAGO_SYNC_SECRET', 'test-sync-secret');
  rpc.mockResolvedValue({ data: true, error: null });
  single.mockResolvedValue({ data: { ultima_correcta: null, collector_id: null }, error: null });
  upsert.mockResolvedValue({ error: null });
  from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single }) }), upsert,
    update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function respuesta(json: unknown) { return { ok: true, json: async () => json }; }

describe('sincronización persistente', () => {
  it('no usa la credencial de Global en otra óptica', async () => {
    expect((await sincronizarMercadoPago('otra')).estado).toBe('no_configurado');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('archiva todas las páginas, con upsert y sin crear pagos de caja', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(respuesta({ id: 123 }))
      .mockResolvedValueOnce(respuesta({ results: Array.from({ length: 100 }, (_, i) => ({ ...pago, id: 123456 + i })), paging: { total: 101 } }))
      .mockResolvedValueOnce(respuesta({ results: [{ ...pago, id: 999999 }], paging: { total: 101 } }));
    vi.stubGlobal('fetch', fetch);
    expect(await sincronizarMercadoPago('global')).toEqual({ estado: 'correcto', guardados: 101 });
    expect(fetch.mock.calls[2][0]).toContain('offset=100');
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: 'tenant_id,pago_id' });
    expect(from.mock.calls.every(([tabla]) => ['mercadopago_sync', 'mercadopago_pagos'].includes(tabla))).toBe(true);
    expect(rpc.mock.calls.at(-1)?.[1].p_hasta).toBeTruthy();
  });
  it('no avanza el checkpoint ante un fallo parcial y deja reintentar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(respuesta({ id: 123 }))
      .mockResolvedValueOnce(respuesta({ results: [pago], paging: { total: 101 } }))
      .mockRejectedValueOnce(new Error('token-que-no-debe-filtrarse')));
    await expect(sincronizarMercadoPago('global')).rejects.toThrow('No se pudo sincronizar');
    expect(rpc.mock.calls.at(-1)?.[1].p_hasta).toBeNull();
  });
  it('una ejecución concurrente no consulta ni reescribe snapshots', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect((await sincronizarMercadoPago('global')).estado).toBe('en_curso');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('impide sustituir la cuenta del proveedor silenciosamente', async () => {
    single.mockResolvedValue({ data: { ultima_correcta: null, collector_id: '456' }, error: null });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta({ id: 123 })));
    await expect(sincronizarMercadoPago('global')).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });
  it('el endpoint de servicio rechaza solicitudes sin secreto incluso con sesión', async () => {
    for (const auth of ['', 'Bearer incorrecto', 'Bearer éééééééééééééééé']) {
      const r = await POST(new Request('https://example.test/api/integraciones/mercadopago/sync', { method: 'POST', headers: { authorization: auth } }));
      expect(r.status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
