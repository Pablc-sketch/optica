// Todo lo que cuesta hacer un operativo (sin cristales ni marcos, que se
// cuentan aparte): transporte, arriendo del salón, equipos y cartilla del
// colega, viáticos, otros y el ayudante. Un solo lugar para la suma: antes
// estaba repetida en seis pantallas.
export type GastosOperativo = {
  costo_transporte: number;
  costo_arriendo: number;
  costo_viaticos: number;
  costo_otros: number;
  costo_ayudante?: number | null;
  costo_equipos?: number | null;
};

// Valor sugerido del arriendo de equipos + cartilla por día.
export const EQUIPOS_POR_DIA = 52000;

export function gastosDeOperativo(o: GastosOperativo): number {
  return (
    o.costo_transporte +
    o.costo_arriendo +
    o.costo_viaticos +
    o.costo_otros +
    (o.costo_ayudante ?? 0) +
    (o.costo_equipos ?? 0)
  );
}
