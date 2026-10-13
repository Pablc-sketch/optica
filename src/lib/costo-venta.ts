// Costo real de lo vendido (para calcular utilidad neta, no solo "venta
// menos gastos del operativo"): el cristal pesa por su costo_laboratorio
// (cristal + montaje + IVA), cada par de cristales suma el costo de su
// marco (monto fijo, ver abajo), y cualquier otro producto pesa por su
// costo de Inventario.
//
// Costo de marco: $5.000 por CADA PAR de cristales vendido (pedido de
// Pablo, 13-10-2026). Se cuenta por par y no por marco del inventario:
// los marcos descritos a mano ("acetato negro"), los que quedaron sin
// registrar y los de cortesía no estaban sumando costo, y la utilidad se
// veía más alta que la real. Dos pares en una venta = dos marcos.
// (Antes: $3.248 solo por marco cargado en Inventario, de la compra de
// 24 marcos a Comercializadora Inosc, op. 176823790693.)
export const COSTO_MARCO_POR_PAR = 5000;
/** @deprecated nombre antiguo; es el mismo costo por par. */
export const COSTO_MARCO_ABSORBIDO = COSTO_MARCO_POR_PAR;

type OTConCosto = {
  costo_laboratorio: number | null;
  costo_laboratorio_2: number | null;
  tipo_lente?: string | null;
  tratamiento?: string | null;
  tipo_lente_2?: string | null;
  tratamiento_2?: string | null;
};

export type ItemConCosto = {
  cantidad: number;
  descripcion?: string;
  // A cuál de los dos cupos de cristal de la OT corresponde este ítem —
  // lejos y cerca por separado comparten una sola OT, así que el costo de
  // cada uno vive en una columna distinta (costo_laboratorio / _2).
  cristal_slot?: number | null;
  ordenes_trabajo?: OTConCosto | OTConCosto[] | null;
  productos?: { costo: number; categoria: string } | { costo: number; categoria: string }[] | null;
};

function uno<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export type DesgloseCosto = {
  // Un cristal por fila, para que se pueda revisar lente por lente cuánto
  // cuesta de verdad (precio unitario × 2 + montaje + IVA, ya guardado en
  // costo_laboratorio) en vez de solo confiar en el total.
  cristales: { descripcion: string; costo: number }[];
  totalCristales: number;
  // Cuántos pares de cristales (= marcos) hay, y lo que cuestan.
  marcos: number;
  totalArmazones: number;
  totalOtros: number;
  total: number;
};

export function desglosarCostos(items: ItemConCosto[]): DesgloseCosto {
  const cristales: DesgloseCosto["cristales"] = [];
  let marcos = 0;
  let totalOtros = 0;

  for (const it of items) {
    const ot = uno(it.ordenes_trabajo);
    if (ot) {
      const costo = (it.cristal_slot === 2 ? ot.costo_laboratorio_2 : ot.costo_laboratorio) ?? 0;
      const tipoLente = it.cristal_slot === 2 ? ot.tipo_lente_2 : ot.tipo_lente;
      const tratamiento = it.cristal_slot === 2 ? ot.tratamiento_2 : ot.tratamiento;
      cristales.push({
        descripcion: [tipoLente, tratamiento].filter(Boolean).join(" · ") || it.descripcion || "Cristal",
        costo: costo * it.cantidad,
      });
      marcos += it.cantidad;
      continue;
    }
    const producto = uno(it.productos);
    // El marco del inventario ya está contado en el par de cristales al
    // que va: no se cobra dos veces.
    if (producto?.categoria === "armazon") continue;
    if (producto) totalOtros += producto.costo * it.cantidad;
  }

  const totalCristales = cristales.reduce((s, c) => s + c.costo, 0);
  const totalArmazones = marcos * COSTO_MARCO_POR_PAR;
  return { cristales, totalCristales, marcos, totalArmazones, totalOtros, total: totalCristales + totalArmazones + totalOtros };
}

export function costoDeItems(items: ItemConCosto[]): number {
  return desglosarCostos(items).total;
}
