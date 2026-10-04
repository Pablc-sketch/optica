// Validación y normalización de lo que manda el punto de venta, ANTES de
// guardar. Es código puro (sin base de datos) para poder probarlo caso a
// caso.
//
// El caso que lo motivó (F01, folio 62): la vendedora llenó solo el
// "Lente 2". El ítem de venta quedó con cristal_slot=2, pero la orden de
// trabajo guardó ese cristal en su PRIMER cupo, porque la lista de
// cristales viajaba sin número y se asignaba por posición. Resultado: el
// ítem apuntaba a un cupo vacío y su costo se contaba como $0. Lo mismo
// pasaba con los marcos (iban por posición, no por lente).
//
// Ahora cada cristal y cada marco viajan con su cupo explícito, y acá se
// compactan de forma consistente: si solo vino el Lente 2, pasa a ser el
// cupo 1 de la orden, y su ítem y su marco se renumeran igual.

// Número de par dentro de la venta (1, 2, 3…). Cada orden de trabajo
// tiene dos cupos de cristal: los pares 1 y 2 van en la primera orden, el
// 3 y el 4 en la segunda, y así. Una venta de uno o dos pares queda igual
// que siempre, en una sola orden.
export type Cupo = number;
export const MAX_PARES = 6;

export function ubicacionDeCupo(cupo: Cupo): { orden: number; slot: 1 | 2 } {
  return { orden: Math.ceil(cupo / 2) - 1, slot: cupo % 2 === 1 ? 1 : 2 };
}

export type CristalPedido = {
  slot: Cupo;
  tipoLente: string;
  rangoReceta: string;
  tratamiento: string;
  posicion?: "lejos" | "cerca" | null;
};

// Un marco es del inventario (productoId), del paciente (marcoPropio) o
// descrito en palabras ("acetato rojo"), sin cargarlo al inventario.
export type ArmazonPedido = { slot: Cupo; productoId: string | null; marcoPropio: boolean; descripcion?: string | null };

export type ItemPedido = {
  productoId?: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  cristalSlot?: Cupo | null;
};

export type VentaNormalizada = {
  cristales: (CristalPedido & { cupo: Cupo })[];
  marcoDeCupo: Partial<Record<Cupo, ArmazonPedido>>;
  items: ItemPedido[];
};

const esEnteroNoNegativo = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;

export function normalizarVenta(
  cristales: CristalPedido[],
  armazones: ArmazonPedido[],
  items: ItemPedido[]
): { ok: true; venta: VentaNormalizada } | { ok: false; error: string } {
  if (items.length === 0) return { ok: false, error: "La venta no tiene ítems." };
  for (const i of items) {
    if (!esEnteroNoNegativo(i.cantidad) || i.cantidad === 0) {
      return { ok: false, error: `Cantidad inválida en "${i.descripcion}".` };
    }
    if (!esEnteroNoNegativo(i.precioUnitario)) {
      return { ok: false, error: `Precio inválido en "${i.descripcion}".` };
    }
  }

  if (cristales.length > MAX_PARES) {
    return { ok: false, error: `Una venta lleva como máximo ${MAX_PARES} pares de cristales.` };
  }
  const slots = cristales.map((c) => c.slot);
  if (new Set(slots).size !== slots.length || slots.some((s) => !Number.isInteger(s) || s < 1 || s > MAX_PARES)) {
    return { ok: false, error: "Los cristales vienen con cupos repetidos o inválidos." };
  }

  // Cada cristal tiene exactamente un ítem que lo cobra, y ningún ítem
  // apunta a un cristal que no viene.
  for (const c of cristales) {
    const cobran = items.filter((i) => i.cristalSlot === c.slot).length;
    if (cobran !== 1) return { ok: false, error: `El Lente ${c.slot} no tiene exactamente un ítem de cobro.` };
  }
  if (items.some((i) => i.cristalSlot && !slots.includes(i.cristalSlot))) {
    return { ok: false, error: "Hay un ítem de cristal sin su cristal." };
  }

  const ordenados = [...cristales].sort((a, b) => a.slot - b.slot);
  const cupoNuevo = new Map<Cupo, Cupo>(ordenados.map((c, i) => [c.slot, i + 1]));

  const marcoDeCupo: Partial<Record<Cupo, ArmazonPedido>> = {};
  for (const a of armazones) {
    const cupo = cupoNuevo.get(a.slot);
    // Un marco sin su lente igual se vende (es un ítem más), pero no se
    // ata a ningún cupo de la orden.
    if (cupo) marcoDeCupo[cupo] = { ...a, slot: cupo };
  }

  return {
    ok: true,
    venta: {
      cristales: ordenados.map((c) => ({ ...c, cupo: cupoNuevo.get(c.slot)! })),
      marcoDeCupo,
      items: items.map((i) => (i.cristalSlot ? { ...i, cristalSlot: cupoNuevo.get(i.cristalSlot)! } : { ...i, cristalSlot: null })),
    },
  };
}
