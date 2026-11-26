// Una venta puede tener varias órdenes; su deuda se cuenta una vez.
export function saldoUnicoPorVenta(ordenes: readonly { ventaId: string; saldo: number }[]) {
  return [...new Map(ordenes.map(o => [o.ventaId,o.saldo])).values()].reduce((s,v) => s + Math.max(0,v),0);
}

type OrdenEnCurso = { id: string; folio: number; estado: string };

export function ordenDeCobroPorVenta(
  ordenes: readonly OrdenEnCurso[],
  ventaPorOT: ReadonlyMap<string, { ventaId: string }>,
) {
  const principales = new Map<string, OrdenEnCurso>();
  const ordenadas = [...ordenes].sort((a, b) =>
    Number(b.estado === "listo") - Number(a.estado === "listo")
    || a.folio - b.folio
    || a.id.localeCompare(b.id),
  );
  for (const orden of ordenadas) {
    const venta = ventaPorOT.get(orden.id);
    if (venta && !principales.has(venta.ventaId)) principales.set(venta.ventaId, orden);
  }
  return principales;
}
