// Costo real de lo vendido (para calcular utilidad neta, no solo "venta
// menos gastos del operativo"): el cristal pesa por su costo_laboratorio
// (cristal + montaje + IVA), cada armazón pesa un monto fijo (se regalan,
// pero igual cuestan sourcing/stock — dos marcos en la misma venta cuentan
// el doble), y cualquier otro producto pesa por su costo de Inventario.
const COSTO_MARCO_ABSORBIDO = 4000;

export type ItemConCosto = {
  cantidad: number;
  // A cuál de los dos cupos de cristal de la OT corresponde este ítem —
  // lejos y cerca por separado comparten una sola OT, así que el costo de
  // cada uno vive en una columna distinta (costo_laboratorio / _2).
  cristal_slot?: number | null;
  ordenes_trabajo?:
    | { costo_laboratorio: number | null; costo_laboratorio_2: number | null }
    | { costo_laboratorio: number | null; costo_laboratorio_2: number | null }[]
    | null;
  productos?: { costo: number; categoria: string } | { costo: number; categoria: string }[] | null;
};

function uno<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export function costoDeItems(items: ItemConCosto[]): number {
  return items.reduce((s, it) => {
    const ot = uno(it.ordenes_trabajo);
    if (ot) {
      const costo = it.cristal_slot === 2 ? ot.costo_laboratorio_2 : ot.costo_laboratorio;
      return s + (costo ?? 0) * it.cantidad;
    }
    const producto = uno(it.productos);
    if (producto?.categoria === "armazon") return s + COSTO_MARCO_ABSORBIDO * it.cantidad;
    if (producto) return s + producto.costo * it.cantidad;
    return s;
  }, 0);
}
