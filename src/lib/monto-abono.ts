// Cuánto se cobra AHORA en una venta: lo que se muestra en el botón y lo
// que viaja a la base salen de esta misma función (revisión Codex
// 20-10-2026: con el campo vacío el botón decía "Cobrar $total" pero se
// enviaba abono $0 y la venta quedaba pendiente).
//
//   vacío            → paga todo (total)
//   "0"              → sin abono (0)
//   menor al total   → abono parcial
//   igual o mayor    → total (nunca más que el total)
export type MontoAbono = { monto: number; tipo: "total" | "parcial" | "sin_abono" };

export function montoAbono(texto: string, total: number): MontoAbono {
  const totalSeguro = Math.max(0, Math.round(total));
  if (totalSeguro === 0) return { monto: 0, tipo: "sin_abono" };
  const limpio = texto.replace(/[^\d]/g, "");
  if (texto.trim() === "") return { monto: totalSeguro, tipo: "total" };
  const n = limpio === "" ? 0 : Number(limpio);
  if (n <= 0) return { monto: 0, tipo: "sin_abono" };
  if (n >= totalSeguro) return { monto: totalSeguro, tipo: "total" };
  return { monto: n, tipo: "parcial" };
}
