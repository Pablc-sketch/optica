import { describe, expect, it } from 'vitest';
import { costoFidesParaPago } from '../src/lib/pagos-operativo';
describe('Costo real de Fides al pagar más', () => {
  it('propone los 106.000 reales cuando el cálculo era 95.831', () => {
    expect(costoFidesParaPago('fides',95831,0,106000)).toBe(106000);
  });
  it('incluye abonos anteriores y permite un cargo extra después de completar el pago', () => {
    expect(costoFidesParaPago('fides',95831,50000,56000)).toBe(106000);
    expect(costoFidesParaPago('fides',95831,95831,10169)).toBe(106000);
  });
  it('no modifica el costo para abonos parciales ni otras categorías', () => {
    expect(costoFidesParaPago('fides',95831,0,50000)).toBeNull();
    expect(costoFidesParaPago('fides',95831,50000,45831)).toBeNull();
    expect(costoFidesParaPago('marcos',95831,0,106000)).toBeNull();
  });
  it('rechaza importes negativos, decimales o fuera de precisión', () => {
    for (const monto of [-1,0,1.5,NaN,Number.MAX_SAFE_INTEGER+1]) expect(costoFidesParaPago('fides',0,0,monto)).toBeNull();
    expect(costoFidesParaPago('fides',1,Number.MAX_SAFE_INTEGER,2)).toBeNull();
  });
});
