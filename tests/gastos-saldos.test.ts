import {describe,it,expect} from 'vitest';
import {pagosConAsignaciones,disponibleDeGasto,pagadoCon,PREFIJO_MARCOS,type AsignacionCosto} from '../src/lib/pagos-operativo';
import {desglosarCostos} from '../src/lib/costo-venta';
import {proyectarSalida} from '../src/lib/presupuesto-salida';
const gasto={id:'g',monto:340000,descripcion:'Compra de marcos y bandejas'};
const a:AsignacionCosto={id:'a',gasto_id:'g',operativo_id:'op1',clave:'marcos',monto:120000,anulado_en:null};
describe('pagar con un gasto ya registrado',()=>{
 it('reparte una compra sin volver a descontarla de caja',()=>{
  const asignaciones=[a,{...a,id:'b',operativo_id:'op2',monto:60000}];
  expect(disponibleDeGasto(gasto,asignaciones)).toBe(160000);
  expect(pagadoCon(pagosConAsignaciones([],asignaciones,'op1'),PREFIJO_MARCOS)).toBe(120000);
  expect(pagadoCon(pagosConAsignaciones([],asignaciones,'op2'),PREFIJO_MARCOS)).toBe(60000);
  expect(gasto.monto).toBe(340000);
 });
 it('desvincular recupera el importe disponible sin eliminar el gasto',()=>{
  expect(disponibleDeGasto(gasto,[{...a,anulado_en:'2026-11-18'}])).toBe(340000);
  expect(pagosConAsignaciones([],[{...a,anulado_en:'2026-11-18'}],'op1')).toEqual([]);
 });
 it('un pago directo no se reutiliza como gasto global',()=>{
  expect(disponibleDeGasto({...gasto,descripcion:'Marcos · Colegio'},[])).toBe(0);
 });
 it('mantiene el costo histórico y admite 6000 para los próximos operativos',()=>{
  const items=[{cantidad:2,ordenes_trabajo:{costo_laboratorio:8000,costo_laboratorio_2:null}}];
  expect(desglosarCostos(items).totalArmazones).toBe(10000);
  expect(desglosarCostos(items,6000).totalArmazones).toBe(12000);
 });
});
describe('presupuesto 23–28',()=>{
 const p={fijos:1100000,marcos:6000,cristales:8000,estuche:1000,precio:55000,cantidad:80,comisionPct:10,tarjetaPct:3,reservarIva:true};
 it('calcula umbral, impuestos reservados y reparto sobre costos sin duplicarlos',()=>{
  const n=proyectarSalida(p);
  expect(n.empate).toBe(46);expect(n.ventas).toBe(4400000);expect(n.utilidad).toBe(825479);
  expect(proyectarSalida({...p,cantidad:45}).utilidad).toBeLessThan(0);
  expect(proyectarSalida({...p,cantidad:46}).utilidad).toBeGreaterThanOrEqual(0);
  expect(n.precioPara(500000)).toBe(49273);
 });
 it('no promete equilibrio con precio inferior al costo variable',()=>{
  expect(proyectarSalida({...p,precio:10000}).empate).toBeNull();
  expect(proyectarSalida({...p,cantidad:0}).precioPara(500000)).toBeNull();
 });
});
