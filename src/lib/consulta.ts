// La consulta (examen + receta) cobrada aparte, normalmente $5.000. Se
// guarda como una venta de un solo ítem con esta descripción, para que
// entre a la caja del operativo y cuadre con Mercado Pago.
//
// No cuenta para la comisión de Isadora: la regla vigente es 10% de lo
// VENDIDO en lentes, y las consultas no se contaban antes. Si eso cambia,
// es una decisión de Pablo, no un efecto colateral.
export const DESCRIPCION_CONSULTA = "Consulta / receta";
export const PRECIO_CONSULTA = 5000;

export function esConsulta(descripcion: string | null | undefined): boolean {
  return descripcion === DESCRIPCION_CONSULTA;
}

// Cuánto de una lista de ítems es consulta (cantidad × precio − descuento).
export function totalConsultas(
  items: { descripcion?: string | null; cantidad: number; precio_unitario: number; descuento?: number | null }[]
): number {
  return items
    .filter((i) => esConsulta(i.descripcion))
    .reduce((s, i) => s + i.cantidad * i.precio_unitario - (i.descuento ?? 0), 0);
}
