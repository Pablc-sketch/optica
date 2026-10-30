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
export type ClaveCosto = (typeof COSTOS)[number]["clave"];
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
  return COSTOS.map((c) => ({ ...c, total: op[c.clave] ?? 0, pagado: pagadoCosto(pagos, c.clave) }));
}
