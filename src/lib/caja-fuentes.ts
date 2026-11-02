export type MovimientoCaja = { tipo: string; monto: number; caja: string };
// Un traslado mueve dinero entre cajas; devolver un adelanto no es otro gasto.
export function salidasDeMovimiento(m: MovimientoCaja) {
  if (m.tipo === 'deposito') return { efectivo: m.monto, digital: -m.monto };
  if (m.tipo === 'retiro') return { efectivo: -m.monto, digital: m.monto };
  return { efectivo: m.caja === 'efectivo' ? m.monto : 0, digital: m.caja === 'digital' ? m.monto : 0 };
}
export function pendientePersonal(monto: number, devoluciones: { monto: number }[]) {
  return Math.max(0, monto - devoluciones.reduce((s, d) => s + d.monto, 0));
}
export function montoCaja(v: FormDataEntryValue | null, permitirCero = false): number | null {
  const texto = String(v ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(texto)) return null;
  const n = Number(texto.replaceAll('.', ''));
  return Number.isSafeInteger(n) && n >= (permitirCero ? 0 : 1) ? n : null;
}
