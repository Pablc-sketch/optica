import { describe, expect, it } from 'vitest';
import { conceptoProtegido, diferenciaRevision, validarRevision, type MovimientoRevision } from '../src/lib/revision-financiera';
const base: MovimientoRevision = { id:'1', tabla:'retiros_sueldo', persona:'isadora', fecha:'2026-10-01', monto:90000, caja:'digital', operativo_id:null, revision_version:0, confirmado_en:null };
describe('Chequeo financiero', () => {
  it('muestra el extra realmente pagado a Isadora sin crear una deuda negativa', () => {
    expect(diferenciaRevision(70000,90000)).toEqual({ pendiente:0,extra:20000 });
  });
  it('mantiene visible el ahorro calculado aunque no se haya apartado', () => {
    expect(diferenciaRevision(30000,0)).toEqual({ pendiente:30000,extra:0 });
    expect(validarRevision({...base,persona:'ahorro',monto:0,operativo_id:'op'},'2026-10-01')).toBeNull();
  });
  it('admite aportes negativos de personas y los distingue de gastos y ahorro', () => {
    expect(validarRevision({...base,monto:-5000},'2026-10-01')).toBeNull();
    expect(validarRevision({...base,persona:'ahorro',monto:-5000},'2026-10-01')).toBeTruthy();
    expect(validarRevision({...base,tabla:'gastos_globales',monto:-5000,descripcion:'Salón',categoria:'arriendo'},'2026-10-01')).toBeTruthy();
  });
  it('rechaza cifras imprecisas, fechas inexistentes o futuras', () => {
    for (const m of [{...base,monto:NaN},{...base,monto:1.5},{...base,monto:Number.MAX_SAFE_INTEGER+1},{...base,fecha:'2026-02-30'},{...base,fecha:'2026-11-01'}]) expect(validarRevision(m,'2026-10-01')).toBeTruthy();
  });
  it('no atribuye retiros a dinero personal ni admite personas inventadas', () => {
    expect(validarRevision({...base,caja:'personal'},'2026-10-01')).toBeTruthy();
    expect(validarRevision({...base,persona:'otra'},'2026-10-01')).toBeTruthy();
  });
  it('protege las asociaciones de abonos con costos del operativo', () => {
    for (const descripcion of ['Fides · Sede','Marcos · Sede','Costo operativo · costo_equipos · Sede']) expect(conceptoProtegido({descripcion})).toBe(true);
    expect(conceptoProtegido({descripcion:'Bandejas'})).toBe(false);
  });
});
