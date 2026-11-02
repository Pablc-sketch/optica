export type PagoMercadoPago = {
  pago_id: string; collector_id: string; fecha: string; actualizado_en_proveedor: string;
  monto: number; monto_devuelto: number; estado: string; medio_pago: 'debito' | 'credito' | null;
};

export function idMercadoPago(valor: unknown): string | null {
  if (typeof valor === 'number' && !Number.isSafeInteger(valor)) return null;
  const id = typeof valor === 'number' || typeof valor === 'string' ? String(valor) : '';
  return /^[0-9]{1,30}$/.test(id) ? id : null;
}

// Lista explícita: no persistimos RUT, correo, tarjeta, token ni el JSON completo.
export function normalizarPagoMercadoPago(valor: unknown, collector: string): PagoMercadoPago | null {
  if (!valor || typeof valor !== 'object') throw new Error('Respuesta de pago inválida');
  const p = valor as Record<string, unknown>;
  if (p.live_mode === false || (typeof p.currency_id === 'string' && p.currency_id !== 'CLP')) return null;
  const id = idMercadoPago(p.id);
  if (!id || idMercadoPago(p.collector_id) !== collector || p.live_mode !== true || p.currency_id !== 'CLP'
    || !Number.isSafeInteger(p.transaction_amount) || (p.transaction_amount as number) <= 0
    || !Number.isSafeInteger(p.transaction_amount_refunded ?? 0) || (p.transaction_amount_refunded as number) < 0
    || (p.transaction_amount_refunded as number) > (p.transaction_amount as number)
    || typeof p.status !== 'string' || !/^[a-z_]{1,40}$/.test(p.status)
    || typeof p.date_created !== 'string' || !Number.isFinite(Date.parse(p.date_created))
    || typeof p.date_last_updated !== 'string' || !Number.isFinite(Date.parse(p.date_last_updated))) {
    throw new Error('Respuesta de pago inválida');
  }
  return {
    pago_id: id, collector_id: collector, fecha: new Date(p.date_created).toISOString(),
    actualizado_en_proveedor: new Date(p.date_last_updated).toISOString(),
    monto: p.transaction_amount as number, monto_devuelto: (p.transaction_amount_refunded as number | undefined) ?? 0,
    estado: p.status, medio_pago: p.payment_type_id === 'debit_card' ? 'debito' : p.payment_type_id === 'credit_card' ? 'credito' : null,
  };
}

export const ESTADOS_CONCILIACION: Record<string, string> = {
  vinculado: 'Paciente confirmado · abono protegido', sin_abono: 'Sin abono con esta operación',
  voucher_repetido: 'Voucher repetido · revisar', venta_anulada: 'Venta anulada · revisar',
  revisar_pago: 'Pago devuelto o no aprobado · revisar caja', diferencia: 'Monto o medio distinto · revisar',
  confirmar_paciente: 'Coincidencia de voucher · falta cotejar paciente',
  identidad_incompleta: 'Completar identidad del paciente antes de asociar',
  identidad_modificada: 'La identidad cambió · asociación en revisión',
};

export type IdentidadAbonoMercadoPago = {
  venta_id: string; paciente_id: string; paciente_nombre: string; paciente_rut: string;
  monto: number; medio_pago: string; fecha_abono: string;
};
