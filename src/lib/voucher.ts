export const MENSAJE_VOUCHER = "Anota el número de operación o voucher de la máquina de Mercado Pago.";

export function requiereVoucher(medio: string, monto = 1): boolean {
  return monto > 0 && (medio === "debito" || medio === "credito");
}

export function validarVoucher(medio: string, monto: number, valor: unknown): { numero: string | null; error?: string } {
  const numero = typeof valor === "string" ? valor.trim() : "";
  if (!requiereVoucher(medio, monto)) return { numero: null };
  if (!numero) return { numero: null, error: MENSAJE_VOUCHER };
  if (numero.length > 80 || !/^[A-Za-z0-9/-]+$/.test(numero) || !/[0-9]/.test(numero)) {
    return { numero: null, error: "Copia el número del voucher (hasta 80 caracteres, sin espacios). No ingreses datos de la tarjeta." };
  }
  return { numero };
}
