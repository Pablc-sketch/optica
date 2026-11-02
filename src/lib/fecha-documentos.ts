import { fechaCertificadoFonasa } from './fecha-certificado-fonasa';
export function fechaValidaDocumento(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const dia = new Date(`${fecha}T12:00:00Z`);
  return Number.isFinite(dia.getTime()) && dia.toISOString().slice(0,10) === fecha;
}
// Una fecha documental persistida. Las fechas fuente de caja, receta y DTE
// conservan su significado; editar el documento no altera la contabilidad.
export function fechaDocumentos(fechaVenta: string, pagos: readonly { fecha: string; monto: number }[], guardada?: string | null) {
  return fechaValidaDocumento(guardada) ? guardada : fechaCertificadoFonasa(fechaVenta,pagos);
}
