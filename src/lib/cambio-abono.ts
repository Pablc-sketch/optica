// Corregir el monto o el medio de pago de un abono ya registrado (se anotó
// mal la plata o se marcó débito cuando fue crédito). Reglas:
//   - el monto es un entero mayor que 0;
//   - con los demás abonos no puede pasar del total de la venta;
//   - el medio tiene que ser uno de los que acepta la caja.
export const MEDIOS_ABONO = ["efectivo", "debito", "credito", "transferencia"] as const;
export type MedioAbono = (typeof MEDIOS_ABONO)[number];

export function validarCambioAbono(input: {
  monto: number;
  medio: string;
  totalVenta: number;
  otrosAbonos: number;
}): { ok: true; monto: number; medio: MedioAbono } | { ok: false; error: string } {
  if (!Number.isSafeInteger(input.monto) || input.monto <= 0) return { ok: false, error: "El monto tiene que ser mayor que $0." };
  if (!(MEDIOS_ABONO as readonly string[]).includes(input.medio)) return { ok: false, error: "Elige cómo pagó." };
  const maximo = Math.max(0, input.totalVenta - input.otrosAbonos);
  if (input.monto > maximo) {
    return { ok: false, error: `Con los otros abonos se pasa del total. Máximo $${maximo.toLocaleString("es-CL")}.` };
  }
  return { ok: true, monto: input.monto, medio: input.medio as MedioAbono };
}

export function estadoPago(total: number, pagado: number): "pendiente" | "abono_parcial" | "pagada" {
  if (pagado >= total) return "pagada";
  return pagado > 0 ? "abono_parcial" : "pendiente";
}
