import { describe, expect, it } from 'vitest';
import { calcularCaja } from '../src/lib/caja';
import { montoCaja, pendientePersonal, salidasDeMovimiento } from '../src/lib/caja-fuentes';
describe('cajas y adelantos personales', () => {
  it('pagar personalmente un gasto no descuenta de la cuenta ni del efectivo', () => {
    const r = calcularCaja({ entradas:[{monto:100000,medio_pago:'transferencia'},{monto:80000,medio_pago:'efectivo'}], salidas:[{monto:30000,caja:'personal'}] });
    expect(r).toMatchObject({ hayDigital:100000,hayEfectivo:80000,total:180000 });
    expect(pendientePersonal(30000,[])).toBe(30000);
  });
  it('una devolución parcial reduce deuda y una sola caja; no vuelve a sumar el gasto', () => {
    expect(pendientePersonal(30000,[{monto:12000}])).toBe(18000);
    expect(salidasDeMovimiento({tipo:'devolucion',monto:12000,caja:'digital'})).toEqual({digital:12000,efectivo:0});
  });
  it.each([['deposito',25000,-25000],['retiro',-25000,25000]])('un %s conserva el total de dinero', (tipo,efectivo,digital) => {
    const r = salidasDeMovimiento({tipo,monto:25000,caja:'digital'});
    expect(r).toEqual({efectivo,digital});
    expect(r.efectivo+r.digital).toBe(0);
  });
  it('rechaza montos ambiguos, negativos, decimales y fuera del rango seguro', () => {
    for (const v of ['','-1','1.5','2e4','10.00','Infinity','9007199254740992']) expect(montoCaja(v)).toBeNull();
    expect(montoCaja('25.000')).toBe(25000);
    expect(montoCaja('0')).toBeNull();
    expect(montoCaja('0',true)).toBe(0);
  });
});
