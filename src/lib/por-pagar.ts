// Lo que falta pagar de cada operativo. Lo ya pagado no aparece.
//   Costos: Fides (cristales), marcos por reponer ($5.000 por par) y gastos
//   del operativo (equipos y cartilla, salón, ayudante…).
//   Sueldos: Isadora, mamá y Pablo. Ahorro: lo que se separa aparte.
export type OperativoPorPagar = {
  operativoId: string; nombre: string; fecha: string;
  sueldos: { isadora: number; madre: number; pablo: number };
  fides: number; marcos?: number; gastos: number; ahorro: number;
  pagado: { isadora: number; madre: number; pablo: number; fides: number; marcos?: number; gastos: number; ahorro: number };
};
export type PendienteOperativo = {
  personas: { pablo: number; madre: number; isadora: number };
  operativoId: string; nombre: string; fecha: string;
  fides: number; marcos: number; gastos: number;
  sueldos: number; costos: number; ahorro: number; total: number;
};
export const faltaPagar = (total: number, pagado: number) => Math.max(0, total - pagado);
export function pendienteDeOperativo(o: OperativoPorPagar): PendienteOperativo {
  const personas = { pablo: faltaPagar(o.sueldos.pablo, o.pagado.pablo), madre: faltaPagar(o.sueldos.madre, o.pagado.madre), isadora: faltaPagar(o.sueldos.isadora, o.pagado.isadora) };
  const sueldos = faltaPagar(o.sueldos.isadora, o.pagado.isadora)
    + faltaPagar(o.sueldos.madre, o.pagado.madre) + faltaPagar(o.sueldos.pablo, o.pagado.pablo);
  const fides = faltaPagar(o.fides, o.pagado.fides);
  const marcos = faltaPagar(o.marcos ?? 0, o.pagado.marcos ?? 0);
  const gastos = faltaPagar(o.gastos, o.pagado.gastos);
  const costos = fides + marcos + gastos;
  const ahorro = faltaPagar(o.ahorro, o.pagado.ahorro);
  return { personas, operativoId: o.operativoId, nombre: o.nombre, fecha: o.fecha, fides, marcos, gastos, sueldos, costos, ahorro, total: sueldos + costos };
}
export type ResumenPorPagar = {
  personas: { pablo: number; madre: number; isadora: number };
  fides: number; marcos: number; gastos: number;
  sueldos: number; costos: number; ahorro: number; total: number;
  operativos: PendienteOperativo[];
};
export function resumirPorPagar(lista: OperativoPorPagar[]): ResumenPorPagar {
  const operativos = lista.map(pendienteDeOperativo).filter((p) => p.total > 0 || p.ahorro > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (f: (p: PendienteOperativo) => number) => operativos.reduce((s, p) => s + f(p), 0);
  const sueldos = suma((p) => p.sueldos);
  const costos = suma((p) => p.costos);
  return {
    personas: { pablo: suma(p => p.personas.pablo), madre: suma(p => p.personas.madre), isadora: suma(p => p.personas.isadora) },
    fides: suma((p) => p.fides), marcos: suma((p) => p.marcos), gastos: suma((p) => p.gastos),
    sueldos, costos, ahorro: suma((p) => p.ahorro), total: sueldos + costos, operativos,
  };
}
