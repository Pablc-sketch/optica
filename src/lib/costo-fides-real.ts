import type { DesgloseCosto } from './costo-venta';
// El total real del laboratorio reemplaza la estimación, nunca se suma a ella.
export function conCostoFidesReal(desglose: DesgloseCosto, real?: number | null): DesgloseCosto {
  if (real == null) return desglose;
  return { ...desglose, totalCristales: real, total: desglose.total - desglose.totalCristales + real };
}
