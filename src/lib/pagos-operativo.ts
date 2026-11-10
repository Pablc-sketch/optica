import type { GastosOperativo } from "./gastos-operativo";

// Identificadores estables: el nombre del operativo puede cambiar.
export const COSTOS = [
  { clave: "costo_equipos", titulo: "Equipos + cartilla" },
  { clave: "costo_arriendo", titulo: "Salón" },
  { clave: "costo_transporte", titulo: "Transporte" },
  { clave: "costo_viaticos", titulo: "Viáticos" },
  { clave: "costo_ayudante", titulo: "Ayudante" },
  { clave: "costo_otros", titulo: "Otros" },
] as const;
export type ClaveCosto = (typeof COSTOS)[number]["clave"]|"costo_hospedaje";
export const prefijoCosto = (clave: ClaveCosto) => `Costo operativo · ${clave} · `;
// Fides y marcos no son columnas del operativo: su monto sale de lo vendido.
export const PREFIJO_FIDES = "Fides · ";
export const PREFIJO_MARCOS = "Marcos · ";
export type PagoCosto = { descripcion: string; monto: number };
export function pagadoCon(pagos: PagoCosto[], prefijo: string) {
  return pagos.filter((p) => p.descripcion.startsWith(prefijo)).reduce((s, p) => s + p.monto, 0);
}
export function pagadoCosto(pagos: PagoCosto[], clave: ClaveCosto) {
  return pagos.filter((p) => p.descripcion.startsWith(prefijoCosto(clave))).reduce((s, p) => s + p.monto, 0);
}
export function pendientesCostos(op: GastosOperativo, pagos: PagoCosto[]) {
  const costos:readonly {clave:ClaveCosto;titulo:string}[]=op.costo_hospedaje?[...COSTOS,{clave:"costo_hospedaje",titulo:"Hospedaje"}]:COSTOS;
  return costos.map((c) => ({ ...c, total: op[c.clave] ?? 0, pagado: pagadoCosto(pagos, c.clave) }));
}

// Un abono extra de laboratorio implica un nuevo costo total, incluyendo
// lo que ya se pagó. Se confirma el costo antes de registrar la salida.
export function costoFidesParaPago(clave: string, total: number, pagado: number, monto: number): number | null {
  if (clave !== 'fides' || !Number.isSafeInteger(monto) || monto <= 0
    || !Number.isSafeInteger(pagado) || pagado < 0 || !Number.isSafeInteger(pagado + monto)
    || pagado + monto <= total) return null;
  return pagado + monto;
}
