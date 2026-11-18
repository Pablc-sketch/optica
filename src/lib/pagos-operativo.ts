import type { GastosOperativo } from "./gastos-operativo";

// Identificadores estables: el nombre del operativo puede cambiar.
export const COSTOS = [
  { clave: "costo_equipos", titulo: "Equipos + cartilla" },
  { clave: "costo_arriendo", titulo: "Salón" },
  { clave: "costo_transporte", titulo: "Transporte" },
  { clave: "costo_viaticos", titulo: "Viáticos" },
  { clave: "costo_hospedaje", titulo: "Hospedaje" },
  { clave: "costo_comida", titulo: "Comida" },
  { clave: "costo_peajes", titulo: "Peajes y TAG" },
  { clave: "costo_ayudante", titulo: "Ayudante" },
  { clave: "costo_otros", titulo: "Otros" },
] as const;
export type ClaveCosto = (typeof COSTOS)[number]["clave"];
export const prefijoCosto = (clave: ClaveCosto) => `Costo operativo · ${clave} · `;
// Fides y marcos no son columnas del operativo: su monto sale de lo vendido.
export const PREFIJO_FIDES = "Fides · ";
export const PREFIJO_MARCOS = "Marcos · ";
export type PagoCosto = { descripcion: string; monto: number };
export type AsignacionCosto = { id: string; gasto_id: string; operativo_id: string; clave: string; monto: number; anulado_en: string | null };
export const esPagoDeCosto = (descripcion: string) => /^(Costo operativo · |Fides · |Marcos · )/.test(descripcion);
export function pagosConAsignaciones(pagos: PagoCosto[], asignaciones: AsignacionCosto[], operativoId: string): PagoCosto[] {
  return [...pagos, ...asignaciones.filter(a => a.operativo_id === operativoId && !a.anulado_en).map(a => ({
    monto: a.monto, descripcion: a.clave === 'fides' ? PREFIJO_FIDES : a.clave === 'marcos' ? PREFIJO_MARCOS : prefijoCosto(a.clave as ClaveCosto),
  }))];
}
export function disponibleDeGasto(gasto: { id: string; monto: number; descripcion: string }, asignaciones: AsignacionCosto[]) {
  return esPagoDeCosto(gasto.descripcion) ? 0 : Math.max(0, gasto.monto - asignaciones.filter(a => a.gasto_id === gasto.id && !a.anulado_en).reduce((s,a) => s+a.monto,0));
}
export function pagadoCon(pagos: PagoCosto[], prefijo: string) {
  return pagos.filter((p) => p.descripcion.startsWith(prefijo)).reduce((s, p) => s + p.monto, 0);
}
export function pagadoCosto(pagos: PagoCosto[], clave: ClaveCosto) {
  return pagos.filter((p) => p.descripcion.startsWith(prefijoCosto(clave))).reduce((s, p) => s + p.monto, 0);
}
export function pendientesCostos(op: GastosOperativo, pagos: PagoCosto[]) {
  return COSTOS.map((c) => ({ ...c, total: op[c.clave] ?? 0, pagado: pagadoCosto(pagos, c.clave) }));
}

// Un abono extra de laboratorio implica un nuevo costo total, incluyendo
// lo que ya se pagó. Se confirma el costo antes de registrar la salida.
export function costoFidesParaPago(clave: string, total: number, pagado: number, monto: number): number | null {
  if (clave !== 'fides' || !Number.isSafeInteger(monto) || monto <= 0
    || !Number.isSafeInteger(pagado) || pagado < 0 || !Number.isSafeInteger(pagado + monto)
    || pagado + monto <= total) return null;
  return pagado + monto;
}
