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
  // Gasto real anotado en el detalle por categoría (operativo_costos),
  // totalizado por la base. Nunca se superpone con las columnas de arriba:
  // la base no deja anotar la misma categoría en los dos lugares.
  costo_detalle_real?: number | null;
};


export function gastosDeOperativo(o: GastosOperativo): number {
  return (
    o.costo_transporte +
    o.costo_arriendo +
    o.costo_viaticos +
    o.costo_otros +
    (o.costo_ayudante ?? 0) +
    (o.costo_equipos ?? 0) +
    (o.costo_detalle_real ?? 0)
  );
}
