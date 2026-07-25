// Formato de montos en pesos chilenos: $86.440 (sin decimales).
export function clp(monto: number): string {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(monto);
}
