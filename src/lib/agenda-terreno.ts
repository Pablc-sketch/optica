import { fechaValidaDocumento } from './fecha-documentos';
import { mesEnChile } from './fechas';

export const ROLES_AGENDA = {
  vendedora: 'Vendedora', tecnologo: 'Tecnólogo/a', coordinador: 'Coordinador/a', kit: 'Kit',
} as const;
export const GASTOS_AGENDA = {
  bencina: 'Bencina y transporte', viaticos: 'Viáticos', hospedaje: 'Hospedaje',
  arriendo: 'Arriendo de equipos', personal: 'Personal', otros: 'Otros',
} as const;
export type TipoRecurso = keyof typeof ROLES_AGENDA;
export type RecursoAgenda = { id: string; tipo: TipoRecurso; nombre: string; detalle: string };
export type Presupuesto = Partial<Record<keyof typeof GASTOS_AGENDA, number>>;
export const uuidAgenda = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const horaAgenda = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export function mesAgenda(entrada: unknown) {
  return typeof entrada === 'string' && /^20\d\d-(?:0[1-9]|1[0-2])$/.test(entrada) ? entrada : mesEnChile();
}
export function costoPorChequeo(costo: number, cantidad: number) {
  return cantidad > 0 ? Math.round(costo / cantidad) : null;
}
export function totalPresupuesto(gastos: Presupuesto) {
  return (Object.keys(GASTOS_AGENDA) as (keyof Presupuesto)[]).reduce((s, k) => s + (gastos[k] ?? 0), 0);
}
export function leerTurno(datos: FormData) {
  const leer = (n: string) => String(datos.get(n) ?? '').trim();
  const id = leer('id'), nombre = leer('nombre'), direccion = leer('direccion');
  const fecha = leer('fecha'), fecha_fin = leer('fecha_fin'), inicio = leer('inicio'), fin = leer('fin');
  if (!uuidAgenda.test(id) || !nombre || nombre.length > 120 || !direccion || direccion.length > 220)
    throw new Error('Completa el nombre y lugar del operativo.');
  if (!fechaValidaDocumento(fecha) || (fecha_fin && !fechaValidaDocumento(fecha_fin))
    || !horaAgenda.test(inicio) || !horaAgenda.test(fin)
    || (fecha_fin && fecha_fin < fecha) || ((!fecha_fin || fecha === fecha_fin) && fin <= inicio))
    throw new Error('Revisa el día y el horario. El término debe ser posterior al inicio.');
  const recursos = Object.fromEntries(Object.keys(ROLES_AGENDA).map(k => [k, leer(k)]));
  if (!Object.values(recursos).every(v => uuidAgenda.test(v))) throw new Error('Elige las tres personas y el kit.');
  const cantidad = (k: string, max: number) => {
    const v = leer(k).replace(/\./g,'');
    if (v && (!/^\d+$/.test(v) || Number(v) > max)) throw new Error('Revisa los chequeos y montos: usa números enteros.');
    return Number(v);
  };
  return { id, editar: leer('editar') === 'si', nombre, direccion, fecha, fecha_fin: fecha_fin || null,
    inicio, fin, meta: cantidad('meta',10000), ...recursos,
    presupuesto: Object.fromEntries(Object.keys(GASTOS_AGENDA).map(k => [k,cantidad(k,999999999)])) };
}
