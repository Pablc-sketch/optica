import { describe, it, expect } from 'vitest';
import { idMercadoPago, normalizarPagoMercadoPago } from '../src/lib/mercadopago-datos';

const pago = { id: 186851523418, collector_id: 123, currency_id: 'CLP', live_mode: true,
  transaction_amount: 19000, transaction_amount_refunded: 0, status: 'approved', payment_type_id: 'debit_card',
  date_created: '2026-10-30T10:00:00Z', date_last_updated: '2026-10-30T10:01:00Z',
  payer: { email: 'privado@example.test' }, card: { last_four_digits: '1234' } };

describe('archivo seguro de operaciones Mercado Pago', () => {
  it('guarda solo el respaldo mínimo sin datos personales o de tarjeta', () => {
    expect(normalizarPagoMercadoPago(pago, '123')).toEqual({ pago_id: '186851523418', collector_id: '123',
      fecha: '2026-10-30T10:00:00.000Z', actualizado_en_proveedor: '2026-10-30T10:01:00.000Z',
      monto: 19000, monto_devuelto: 0, estado: 'approved', medio_pago: 'debito' });
  });
  it('rechaza otra cuenta y no archiva pruebas ni otras monedas', () => {
    expect(() => normalizarPagoMercadoPago(pago, '456')).toThrow();
    expect(normalizarPagoMercadoPago({ ...pago, live_mode: false }, '123')).toBeNull();
    expect(normalizarPagoMercadoPago({ ...pago, currency_id: 'USD' }, '123')).toBeNull();
  });
  it('no inventa números ni acepta importes o fechas dañados', () => {
    for (const cambio of [{ id: Number.MAX_SAFE_INTEGER + 1 }, { transaction_amount: 0 }, { transaction_amount: 1.5 },
      { date_last_updated: 'incorrecta' }, { transaction_amount_refunded: -1 }, { transaction_amount_refunded: 19001 }]) {
      expect(() => normalizarPagoMercadoPago({ ...pago, ...cambio }, '123')).toThrow();
    }
    expect(idMercadoPago('11/12')).toBeNull();
    expect(idMercadoPago('186851523418')).toBe('186851523418');
  });
  it('conserva devoluciones y contracargos sin marcarlos como pago aprobado', () => {
    expect(normalizarPagoMercadoPago({ ...pago, status: 'refunded', transaction_amount_refunded: 19000 }, '123'))
      .toMatchObject({ estado: 'refunded', monto_devuelto: 19000 });
    expect(normalizarPagoMercadoPago({ ...pago, payment_type_id: 'bank_transfer' }, '123')?.medio_pago).toBeNull();
  });
});
