// Lectura del aviso que Meta envía a la página durante el alta (Embedded
// Signup). Sin React, para poder probarlo.

export type Sesion = { phoneNumberId: string; wabaId: string; businessId: string | null; enApp: boolean };

// Solo se aceptan mensajes de facebook.com (o sus subdominios).
export function origenDeMeta(origin: string): boolean {
  try {
    const h = new URL(origin).hostname;
    return h === "facebook.com" || h.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

// Lee el aviso «WA_EMBEDDED_SIGNUP» que Meta manda a la página.
export function leerAvisoMeta(data: unknown): { tipo: "fin"; sesion: Sesion } | { tipo: "cancelado" | "error"; detalle: string } | null {
  let d: Record<string, unknown>;
  try {
    d = typeof data === "string" ? JSON.parse(data) : (data as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!d || d.type !== "WA_EMBEDDED_SIGNUP") return null;
  const datos = (d.data ?? {}) as Record<string, unknown>;
  if (d.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || d.event === "FINISH") {
    const cuentas = Array.isArray(datos.messaging_account_ids) ? datos.messaging_account_ids : [];
    const waba = String(cuentas[0] ?? datos.waba_id ?? "");
    return {
      tipo: "fin",
      sesion: {
        phoneNumberId: String(datos.phone_number_id ?? ""),
        wabaId: waba,
        businessId: datos.business_id ? String(datos.business_id) : null,
        enApp: d.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" || datos.is_on_biz_app === true,
      },
    };
  }
  if (d.event === "CANCEL") return { tipo: "cancelado", detalle: String(datos.current_step ?? "") };
  if (d.event === "ERROR") return { tipo: "error", detalle: String(datos.error_message ?? "") };
  return null;
}

