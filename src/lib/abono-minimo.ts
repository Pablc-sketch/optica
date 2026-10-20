// Abono mínimo de una venta: lo que cuesta de verdad mandar a hacer los
// pares (cristal a Fides + marco), redondeado hacia arriba a mil, para no
// poner plata propia mientras se espera el saldo. Nunca menos que el mínimo
// fijo por tipo de siempre, ni más que el total. Revisión Codex
// 20-10-2026: un foto gris filtro azul tallado cuesta ~$41.769 + marco, y
// el mínimo fijo de $10.000 no lo cubría.
export function abonoMinimoDe(
  pares: { precio: number; costoCristal: number | null; minimoFijo: number }[],
  costoMarco: number,
  total: number
): number {
  const suma = pares
    .filter((p) => p.precio > 0)
    .reduce((s, p) => {
      const real = p.costoCristal === null ? 0 : Math.ceil((p.costoCristal + costoMarco) / 1000) * 1000;
      return s + Math.min(p.precio, Math.max(p.minimoFijo, real));
    }, 0);
  return Math.min(total, suma);
}
