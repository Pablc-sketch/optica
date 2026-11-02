import 'server-only';
import { idMercadoPago } from '@/lib/mercadopago-datos';
export type SaldoMercadoPago =
  | { estado: 'disponible'; disponible: number; total: number; consultadoEn: string }
  | { estado: 'no_habilitado' | 'error' | 'no_configurado' };

// Consulta únicamente el saldo provisto por Mercado Pago. Nunca se calcula
// el saldo bancario a partir de pagos, comisiones estimadas o abonos de Lentia.
export async function consultarSaldoMercadoPago(tenant: string, collector: string | null,
  config = { tenant: process.env.MERCADOPAGO_TENANT_ID, token: process.env.MERCADOPAGO_ACCESS_TOKEN },
  solicitar: typeof fetch = fetch): Promise<SaldoMercadoPago> {
  if (!config.token || !tenant || tenant !== config.tenant || !collector || idMercadoPago(collector) !== collector)
    return { estado: 'no_configurado' };
  try {
    const r = await solicitar(`https://api.mercadopago.com/users/${collector}/mercadopago_account/balance`, {
      headers: { Authorization: `Bearer ${config.token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if ([401,403,404].includes(r.status)) return { estado: 'no_habilitado' };
    if (!r.ok) return { estado: 'error' };
    const p: unknown = await r.json();
    if (!p || typeof p !== 'object') return { estado: 'error' };
    const datos = p as Record<string, unknown>;
    if (idMercadoPago(datos.user_id) !== collector || datos.currency_id !== 'CLP'
      || typeof datos.available_balance !== 'number' || !Number.isFinite(datos.available_balance)
      || typeof datos.total_amount !== 'number' || !Number.isFinite(datos.total_amount)) return { estado: 'error' };
    return { estado: 'disponible', disponible: datos.available_balance, total: datos.total_amount, consultadoEn: new Date().toISOString() };
  } catch { return { estado: 'error' }; }
}
