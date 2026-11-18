export type PresupuestoSalida = {
  fijos: number; marcos: number; cristales: number; estuche: number;
  precio: number; cantidad: number; comisionPct: number; tarjetaPct: number; reservarIva: boolean;
};
// Flujo conservador: reserva todo el débito IVA y no presume crédito fiscal.
// No incorpora ingresos por consultas ni trabajo de los dueños como costo.
export function proyectarSalida(p: PresupuestoSalida) {
  const variables = p.marcos+p.cristales+p.estuche;
  const factor = (p.reservarIva ? 1/1.19 : 1) - (p.comisionPct+p.tarjetaPct)/100;
  const aporte = p.precio*factor - variables;
  const ventas = p.precio*p.cantidad;
  const costos = p.fijos + variables*p.cantidad;
  const reserva = p.reservarIva ? ventas*19/119 : 0;
  const comisiones = ventas*(p.comisionPct+p.tarjetaPct)/100;
  return { ventas, costos, reserva:Math.round(reserva),comisiones:Math.round(comisiones),
    aporte:Math.round(aporte), empate:aporte>0 ? Math.ceil(p.fijos/aporte) : null,
    utilidad:Math.round(ventas-costos-reserva-comisiones),
    precioPara: (objetivo: number) => p.cantidad>0 && factor>0 ? Math.ceil((variables+(p.fijos+objetivo)/p.cantidad)/factor) : null,
  };
}
