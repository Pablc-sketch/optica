import { fechaValidaDocumento } from './fecha-documentos';

export const PERSONAS_REVISION = { isadora: 'Isadora', madre: 'Pamela', pablo: 'Pablo', ahorro: 'Ahorro' } as const;
export type MovimientoRevision = {
  id: string; tabla: 'gastos_globales' | 'retiros_sueldo'; fecha: string; monto: number;
  caja: string; operativo_id: string | null; revision_version: number; confirmado_en: string | null;
  descripcion?: string; categoria?: string; persona?: string; motivo?: string | null; es_sueldo?: boolean;
};
export function diferenciaRevision(calculado: number, registrado: number) {
  return { pendiente: Math.max(0, calculado - registrado), extra: Math.max(0, registrado - calculado) };
}
export function conceptoProtegido(m: Pick<MovimientoRevision, 'descripcion'>) {
  return /^(Costo operativo · |Fides · |Marcos · )/.test(m.descripcion ?? '');
}
export function validarRevision(m: MovimientoRevision, hoy: string): string | null {
  if (!Number.isSafeInteger(m.monto) || !fechaValidaDocumento(m.fecha) || m.fecha > hoy) return 'Revisa el monto y la fecha.';
  if (!['digital','efectivo','personal'].includes(m.caja)) return 'Elige de dónde salió el dinero.';
  if (m.tabla === 'gastos_globales') {
    if (m.monto < 0 || !m.descripcion?.trim() || m.descripcion.trim().length > 250 || !['otro','arriendo','compra_inventario'].includes(m.categoria ?? '')) return 'Revisa la descripción y categoría del gasto.';
  } else {
    if (!Object.hasOwn(PERSONAS_REVISION, m.persona ?? '') || m.caja === 'personal' || (m.persona === 'ahorro' && m.monto < 0) || (m.motivo?.length ?? 0) > 250) return 'Revisa la persona, el ahorro y el origen.';
  }
  return null;
}
