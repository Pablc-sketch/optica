// La consulta (examen + receta) cobrada aparte. El precio es de cada óptica
// (configuracion_optica.precio_consulta). Se guarda como una venta de un
// solo ítem con esta descripción, para que entre a la caja del operativo y
// cuadre con Mercado Pago. No cuenta para la comisión de quien vende.
export const DESCRIPCION_CONSULTA = "Consulta / receta";

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

// Una venta que es solo consulta (sin lentes ni productos). No cuenta para
// el ticket promedio de lentes ni para "cuántos compraron".
export function esVentaDeConsulta(items: { descripcion?: string | null }[] | null | undefined): boolean {
  return Boolean(items && items.length > 0 && items.every((i) => esConsulta(i.descripcion)));
}
