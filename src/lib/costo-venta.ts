// Costo real de lo vendido (para calcular utilidad neta, no solo "venta
// menos gastos del operativo"): el cristal pesa por su costo_laboratorio
// (cristal + montaje + IVA), cada armazón pesa un monto fijo (se regalan,
// pero igual cuestan sourcing/stock — dos marcos en la misma venta cuentan
// el doble), y cualquier otro producto pesa por su costo de Inventario.
const COSTO_MARCO_ABSORBIDO = 4000;

export type ItemConCosto = {
  cantidad: number;
  ordenes_trabajo?: { costo_laboratorio: number | null } | { costo_laboratorio: number | null }[] | null;
  productos?: { costo: number; categoria: string } | { costo: number; categoria: string }[] | null;
};

function uno<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export function costoDeItems(items: ItemConCosto[]): number {
  return items.reduce((s, it) => {
    const ot = uno(it.ordenes_trabajo);
    if (ot) return s + (ot.costo_laboratorio ?? 0) * it.cantidad;
    const producto = uno(it.productos);
    if (producto?.categoria === "armazon") return s + COSTO_MARCO_ABSORBIDO * it.cantidad;
    if (producto) return s + producto.costo * it.cantidad;
    return s;
  }, 0);
}
