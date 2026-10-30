import "server-only";

type Config = { apiKey?: string; tenantId?: string };
export type EstadoSimpleApi =
  | { estado: "pendiente" | "sin_acceso" | "limite" | "error" }
  | { estado: "conectado"; uso: number; maximo: number };

function configuracion(): Config {
  return { apiKey: process.env.SIMPLEAPI_API_KEY, tenantId: process.env.SIMPLEAPI_TENANT_ID };
}

export function simpleApiConfigurada(tenantId: string, config: Config = configuracion()): boolean {
  return Boolean(config.apiKey?.trim() && config.tenantId && tenantId === config.tenantId);
}

// Consulta explícita del plan. No genera DTE, consume folios ni envía
// información de ventas. Nunca devuelve la clave o el cuerpo del proveedor.
export async function consultarSimpleApi(
  tenantId: string,
  config: Config = configuracion(),
  solicitar: typeof fetch = fetch,
): Promise<EstadoSimpleApi> {
  if (!simpleApiConfigurada(tenantId, config)) return { estado: "pendiente" };
  try {
    const r = await solicitar("https://api.simpleapi.cl/api/v1/Suscripcion/status", {
      method: "GET",
      headers: { Authorization: config.apiKey!.trim(), Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (r.status === 401 || r.status === 403) return { estado: "sin_acceso" };
    if (r.status === 429) return { estado: "limite" };
    if (!r.ok) return { estado: "error" };
    const servicios: unknown = await r.json();
    if (!Array.isArray(servicios)) return { estado: "error" };
    const dte = servicios.find((s: unknown) => s && typeof s === "object" && "servicio" in s && s.servicio === "SimpleAPI");
    if (!dte || !Number.isSafeInteger(dte.uso) || dte.uso < 0 || !Number.isSafeInteger(dte.maximo) || dte.maximo <= 0) {
      return { estado: "error" };
    }
    return { estado: "conectado", uso: dte.uso, maximo: dte.maximo };
  } catch {
    return { estado: "error" };
  }
}
