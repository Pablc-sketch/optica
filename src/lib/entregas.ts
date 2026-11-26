export type EstadoOTEntrega = {
  estado: string;
  tipo_lente: string | null;
  tipo_lente_2: string | null;
};

export const ESTADOS_ENTREGA: Record<string, string> = {
  recepcion: "Recepción",
  laboratorio: "Laboratorio",
  montaje: "Montaje",
  listo: "Listo",
};

export function paresOT(ot: EstadoOTEntrega) {
  return Number(Boolean(ot.tipo_lente?.trim())) + Number(Boolean(ot.tipo_lente_2?.trim())) || 1;
}

export function ordenarPedidosPorSede(ordenes: { operativoId: string | null; sedes: string[]; problema: string | null }[]) {
  const sedes = [...new Set(ordenes.flatMap(ot => ot.sedes))];
  const sede = ordenes[0].operativoId;
  const problema = ordenes.find(ot => ot.problema)?.problema
    ?? (ordenes.some(ot => ot.operativoId !== sede) ? "Hay órdenes de distintas sedes en este pedido." : null);
  return { sedes, sede: problema ? null : sede, problema };
}

export function sedesDeOrden(referencias: (string | null | undefined)[]) {
  return [...new Set(referencias.filter((id): id is string => Boolean(id)))];
}

export function resumirFoliosOT(folios: number[]) {
  const ordenados = [...new Set(folios)].sort((a, b) => a - b);
  const tramos: { desde: number; hasta: number }[] = [];
  for (const folio of ordenados) {
    const tramo = tramos.at(-1);
    if (tramo && folio === tramo.hasta + 1) tramo.hasta = folio;
    else tramos.push({ desde: folio, hasta: folio });
  }
  return {
    primero: ordenados[0],
    ultimo: ordenados.at(-1),
    folios: tramos.map(({ desde, hasta }) => desde === hasta ? String(desde) : `${desde}–${hasta}`).join(", "),
  };
}
