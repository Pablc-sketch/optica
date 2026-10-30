// Lo que todavía hay que pagar de los operativos, para el resumen del
// Inicio. Solo cuenta lo pendiente: lo que ya está pagado no aparece.
//
//   Sueldos: Isadora, mamá y Pablo.
//   Costos: Fides (cristales). Los gastos del operativo (equipos y cartilla,
//           arriendo del salón, transporte, Diego…) no se listan: la caja
//           ya los descuenta sola cuando pasa la fecha del operativo.
//   Ahorro: lo que se aparta del operativo; se muestra mientras el
//           operativo siga con algo por pagar, y sale cuando queda todo
//           pagado.
export type OperativoPorPagar = {
  operativoId: string;
  nombre: string;
  fecha: string;
  // Lo que corresponde pagar en total en este operativo.
  sueldos: { isadora: number; madre: number; pablo: number };
  fides: number;
  ahorro: number;
  // Lo que ya se pagó (retiros y gastos marcados).
  pagado: { isadora: number; madre: number; pablo: number; fides: boolean };
};

export type PendienteOperativo = {
  operativoId: string;
  nombre: string;
  fecha: string;
  sueldos: number;
  costos: number;
  ahorro: number;
  total: number;
};

const falta = (total: number, pagado: number) => Math.max(0, total - pagado);

export function pendienteDeOperativo(o: OperativoPorPagar): PendienteOperativo {
  const sueldos =
    falta(o.sueldos.isadora, o.pagado.isadora) + falta(o.sueldos.madre, o.pagado.madre) + falta(o.sueldos.pablo, o.pagado.pablo);
  const costos = o.pagado.fides ? 0 : Math.max(0, o.fides);
  const ahorro = sueldos + costos > 0 ? Math.max(0, o.ahorro) : 0;
  return {
    operativoId: o.operativoId,
    nombre: o.nombre,
    fecha: o.fecha,
    sueldos,
    costos,
    ahorro,
    total: sueldos + costos,
  };
}

export type ResumenPorPagar = {
  sueldos: number;
  costos: number;
  ahorro: number;
  // Lo que sale de la caja (sueldos + costos). El ahorro se aparta, no se paga.
  total: number;
  operativos: PendienteOperativo[];
};

export function resumirPorPagar(lista: OperativoPorPagar[]): ResumenPorPagar {
  const operativos = lista
    .map(pendienteDeOperativo)
    .filter((p) => p.total > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const suma = (f: (p: PendienteOperativo) => number) => operativos.reduce((s, p) => s + f(p), 0);
  const sueldos = suma((p) => p.sueldos);
  const costos = suma((p) => p.costos);
  return { sueldos, costos, ahorro: suma((p) => p.ahorro), total: sueldos + costos, operativos };
}
