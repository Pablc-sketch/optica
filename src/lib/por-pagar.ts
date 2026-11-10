// Lo que falta pagar de cada operativo. Lo ya pagado no aparece.
//   Costos: laboratorio (cristales), marcos por reponer y gastos del
//   operativo (equipos, salón, ayudante…).
//   Sueldos: las personas del reparto de cada óptica, por su clave.
//   Ahorro: lo que se separa aparte.
export type OperativoPorPagar = {
  operativoId: string; nombre: string; fecha: string;
  // Lo que le corresponde a cada persona del reparto (sin el ahorro).
  sueldos: Record<string, number>;
  fides: number; marcos?: number; gastos: number; ahorro: number;
  pagado: { sueldos: Record<string, number>; fides: number; marcos?: number; gastos: number; ahorro: number };
};
export type PendienteOperativo = {
  personas: Record<string, number>;
  operativoId: string; nombre: string; fecha: string;
  fides: number; marcos: number; gastos: number;
  sueldos: number; costos: number; ahorro: number; total: number;
};
export const faltaPagar = (total: number, pagado: number) => Math.max(0, total - pagado);
export function pendienteDeOperativo(o: OperativoPorPagar): PendienteOperativo {
  const personas: Record<string, number> = {};
  for (const [clave, monto] of Object.entries(o.sueldos)) personas[clave] = faltaPagar(monto, o.pagado.sueldos[clave] ?? 0);
  const sueldos = Object.values(personas).reduce((s, m) => s + m, 0);
  const fides = faltaPagar(o.fides, o.pagado.fides);
  const marcos = faltaPagar(o.marcos ?? 0, o.pagado.marcos ?? 0);
  const gastos = faltaPagar(o.gastos, o.pagado.gastos);
  const costos = fides + marcos + gastos;
  const ahorro = faltaPagar(o.ahorro, o.pagado.ahorro);
  return { personas, operativoId: o.operativoId, nombre: o.nombre, fecha: o.fecha, fides, marcos, gastos, sueldos, costos, ahorro, total: sueldos + costos };
}
export type ResumenPorPagar = {
  personas: Record<string, number>;
  fides: number; marcos: number; gastos: number;
  sueldos: number; costos: number; ahorro: number; total: number;
  operativos: PendienteOperativo[];
};
export function resumirPorPagar(lista: OperativoPorPagar[]): ResumenPorPagar {
  const operativos = lista.map(pendienteDeOperativo).filter((p) => p.total > 0 || p.ahorro > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (f: (p: PendienteOperativo) => number) => operativos.reduce((s, p) => s + f(p), 0);
  const personas: Record<string, number> = {};
  for (const o of operativos) for (const [clave, m] of Object.entries(o.personas)) personas[clave] = (personas[clave] ?? 0) + m;
  const sueldos = suma((p) => p.sueldos);
  const costos = suma((p) => p.costos);
  return {
    personas,
    fides: suma((p) => p.fides), marcos: suma((p) => p.marcos), gastos: suma((p) => p.gastos),
    sueldos, costos, ahorro: suma((p) => p.ahorro), total: sueldos + costos, operativos,
  };
}
