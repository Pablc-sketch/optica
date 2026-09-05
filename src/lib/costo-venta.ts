// Costo real de lo vendido (para calcular utilidad neta, no solo "venta
// menos gastos del operativo"): el cristal pesa por su costo_laboratorio
// (cristal + montaje + IVA), cada armazón pesa un monto fijo (se regalan,
// pero igual cuestan sourcing/stock — dos marcos en la misma venta cuentan
// el doble), y cualquier otro producto pesa por su costo de Inventario.
export const COSTO_MARCO_ABSORBIDO = 4000;

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
  totalArmazones: number;
  totalOtros: number;
  total: number;
};

export function desglosarCostos(items: ItemConCosto[]): DesgloseCosto {
  const cristales: DesgloseCosto["cristales"] = [];
  let totalArmazones = 0;
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
      continue;
    }
    const producto = uno(it.productos);
    if (producto?.categoria === "armazon") {
      totalArmazones += COSTO_MARCO_ABSORBIDO * it.cantidad;
      continue;
    }
    if (producto) totalOtros += producto.costo * it.cantidad;
  }

  const totalCristales = cristales.reduce((s, c) => s + c.costo, 0);
  return { cristales, totalCristales, totalArmazones, totalOtros, total: totalCristales + totalArmazones + totalOtros };
}

export function costoDeItems(items: ItemConCosto[]): number {
  return desglosarCostos(items).total;
}
