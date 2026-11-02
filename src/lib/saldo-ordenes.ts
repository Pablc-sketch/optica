// Una venta puede tener varias órdenes; su deuda se cuenta una vez.
export function saldoUnicoPorVenta(ordenes: readonly { ventaId: string; saldo: number }[]) {
  return [...new Map(ordenes.map(o => [o.ventaId,o.saldo])).values()].reduce((s,v) => s + Math.max(0,v),0);
}
