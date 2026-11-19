import 'server-only';
export class ErrorMercadoPago extends Error {
  constructor(public codigo: string) { super('No se pudo verificar Mercado Pago'); }
}
export async function consultarApiMP(path: string, init: RequestInit = {}, solicitar: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const r = await solicitar(`https://api.mercadopago.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`, 'Content-Type':'application/json', ...init.headers },
    cache:'no-store', redirect:'error', signal:AbortSignal.timeout(12000),
  });
  if(!r.ok) throw new ErrorMercadoPago(`HTTP_${r.status}`);
  const json:unknown=await r.json();
  if(!json||typeof json!=='object'||Array.isArray(json))throw new ErrorMercadoPago('RESPUESTA_INVALIDA');
  return json as Record<string,unknown>;
}
