import { describe, expect, it } from 'vitest';
import { aportePorPar, resumirSimulacion } from '../src/lib/rentabilidad-precios';
import { RECARGOS_OPTICA_GLOBAL } from '../src/lib/niveles-marco';

const perfil = { id: 'ar', nombre: 'AR', precio: 38000, costo: 5000, origen: 'laboratorio' };

describe('simulación conservadora de ganancias', () => {
  it('extrae el IVA incluido y calcula el margen sobre ventas sin IVA', () => {
    const par = aportePorPar({ ...perfil, precio: 119000 }, 'esencial', RECARGOS_OPTICA_GLOBAL, 10000, 1000, 10, 2);
    const r = resumirSimulacion([{ ...par, cantidad: 2 }], 20000);
    expect(r.ventas).toBe(238000);
    expect(r.ventasNetas).toBe(200000);
    expect(r.reserva).toBe(38000);
    expect(r.utilidadAntesReserva).toBeCloseTo(157440);
    expect(r.resultado).toBeCloseTo(119440);
    expect(r.margen).toBeCloseTo(59.72);
  });

  it('pondera las líneas elegidas y descuenta los fijos una sola vez', () => {
    const a = { precio: 119000, operativo: 69000, iva: 19000, cantidad: 1 };
    const b = { precio: 238000, operativo: 138000, iva: 38000, cantidad: 3 };
    const r = resumirSimulacion([a, b], 100000, 250000);
    expect(r.cantidad).toBe(4);
    expect(r.aportePorPar).toBe(87500);
    expect(r.resultado).toBe(250000);
    expect(r.equilibrio).toBe(2);
    expect(r.paresObjetivo).toBe(4);
  });

  it('sin pares mantiene los fijos como pérdida y no inventa margen ni equilibrio', () => {
    const par = aportePorPar(perfil, 'esencial', RECARGOS_OPTICA_GLOBAL, 6000, 1000, 10, 2);
    const r = resumirSimulacion([{ ...par, cantidad: 0 }], 300000, 500000);
    expect(r.resultado).toBe(-300000);
    expect(r.margen).toBeNull();
    expect(r.equilibrio).toBeNull();
    expect(r.paresObjetivo).toBeNull();
    expect(r.aportePorPar).toBe(0);
  });

  it('no ofrece un equilibrio alcanzable si vender cada par deja pérdida', () => {
    const par = aportePorPar(perfil, 'esencial', RECARGOS_OPTICA_GLOBAL, 60000, 1000, 10, 2);
    const r = resumirSimulacion([{ ...par, cantidad: 5 }], 100000, 500000);
    expect(r.resultado).toBeLessThan(0);
    expect(r.margen).toBeLessThan(0);
    expect(r.equilibrio).toBeNull();
    expect(r.paresObjetivo).toBeNull();
  });

  it('admite costo distinto de marcos para cada línea y comisión fraccionaria', () => {
    const a = aportePorPar(perfil, 'esencial', RECARGOS_OPTICA_GLOBAL, 6000, 1000, 10.5, 1.75);
    const b = aportePorPar(perfil, 'premium', RECARGOS_OPTICA_GLOBAL, 20000, 1000, 10.5, 1.75);
    const r = resumirSimulacion([{ ...a, cantidad: 1 }, { ...b, cantidad: 1 }], 0);
    expect(a.precio).toBe(38000);
    expect(b.precio).toBe(59990);
    expect(r.resultado).toBeCloseTo(a.conReserva + b.conReserva);
    expect(r.equilibrio).toBe(0);
  });
});
