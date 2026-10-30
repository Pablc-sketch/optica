export type OperativoPorPagar = {
  operativoId: string; nombre: string; fecha: string;
  sueldos: { isadora: number; madre: number; pablo: number };
  fides: number; gastos: number; ahorro: number;
  pagado: { isadora: number; madre: number; pablo: number; fides: number; gastos: number; ahorro: number };
};
export type PendienteOperativo = {
  operativoId: string; nombre: string; fecha: string;
  sueldos: number; costos: number; ahorro: number; total: number;
};
export const faltaPagar = (total: number, pagado: number) => Math.max(0, total - pagado);
export function pendienteDeOperativo(o: OperativoPorPagar): PendienteOperativo {
  const sueldos = faltaPagar(o.sueldos.isadora, o.pagado.isadora)
    + faltaPagar(o.sueldos.madre, o.pagado.madre) + faltaPagar(o.sueldos.pablo, o.pagado.pablo);
  const costos = faltaPagar(o.fides, o.pagado.fides) + faltaPagar(o.gastos, o.pagado.gastos);
  const ahorro = faltaPagar(o.ahorro, o.pagado.ahorro);
  return { operativoId: o.operativoId, nombre: o.nombre, fecha: o.fecha, sueldos, costos, ahorro, total: sueldos + costos };
}
export type ResumenPorPagar = {
  sueldos: number; costos: number; ahorro: number; total: number;
  operativos: PendienteOperativo[];
};
export function resumirPorPagar(lista: OperativoPorPagar[]): ResumenPorPagar {
  const operativos = lista.map(pendienteDeOperativo).filter((p) => p.total > 0 || p.ahorro > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (f: (p: PendienteOperativo) => number) => operativos.reduce((s, p) => s + f(p), 0);
  const sueldos = suma((p) => p.sueldos);
  const costos = suma((p) => p.costos);
  return { sueldos, costos, ahorro: suma((p) => p.ahorro), total: sueldos + costos, operativos };
}
