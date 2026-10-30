import "server-only";

type Config = { token?: string; tenantId?: string };
type Pago = { id: string; fecha: string; monto: number; estado: string };
export type LecturaMercadoPago = { estado: "pendiente" | "error" | "conectado"; pagos: Pago[] };

// Solo consulta. No crea cobros, abonos en Lentia ni transferencias.
// El token queda limitado a la organización configurada, incluso si otra
// óptica tiene un administrador válido en esta misma instalación.
export async function leerMercadoPago(tenantId: string, config: Config = {
  token: process.env.MERCADOPAGO_ACCESS_TOKEN,
  tenantId: process.env.MERCADOPAGO_TENANT_ID,
}, solicitar: typeof fetch = fetch): Promise<LecturaMercadoPago> {
  if (!config.token || !config.tenantId || tenantId !== config.tenantId) return { estado: "pendiente", pagos: [] };
  try {
    const r = await solicitar("https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&limit=15&offset=0", {
      headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { estado: "error", pagos: [] };
    const json: unknown = await r.json();
    if (!json || typeof json !== "object" || !("results" in json) || !Array.isArray(json.results)) return { estado: "error", pagos: [] };
    const pagos: Pago[] = [];
    for (const p of json.results) {
      if (!p || typeof p !== "object" || !["string", "number"].includes(typeof p.id)
        || typeof p.transaction_amount !== "number" || !Number.isFinite(p.transaction_amount)
        || typeof p.date_created !== "string" || typeof p.status !== "string" || p.currency_id !== "CLP") continue;
      pagos.push({ id: String(p.id), fecha: p.date_created, monto: p.transaction_amount, estado: p.status });
    }
    return { estado: "conectado", pagos };
  } catch { return { estado: "error", pagos: [] }; }
}
