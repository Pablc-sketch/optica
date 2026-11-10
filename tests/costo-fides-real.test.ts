import { expect, it } from 'vitest';
import { numerosDeOperativo } from '../src/lib/cierre-operativo';
import { conCostoFidesReal } from '../src/lib/costo-fides-real';
import { desglosarCostos } from '../src/lib/costo-venta';
import { leerReparto } from '../src/lib/configuracion-optica';

// Configuración de Óptica Global (migración 20261110120000).
const OG = { costoMarcoPorPar: 5000, reparto: leerReparto({ vendedora: { clave: 'isadora', nombre: 'Isadora' }, ahorro: { clave: 'ahorro', nombre: 'Ahorro' }, socios: [{ clave: 'madre', nombre: 'Mamá', pct: 50 }, { clave: 'pablo', nombre: 'Pablo', pct: 50 }] }) };
it('reemplaza la estimación por el total real, sin duplicar el costo ni inventar un pago', () => {
  const desglose = {...desglosarCostos([], 5000),totalCristales:80000,totalArmazones:15000,total:95000};
  expect(conCostoFidesReal(desglose,106000)).toMatchObject({totalCristales:106000,total:121000,totalArmazones:15000});
  expect(conCostoFidesReal(desglose,null)).toEqual(desglose);
  expect(conCostoFidesReal(desglose,0).total).toBe(15000);
});
it('el costo real actualiza utilidad y reparto sin alterar cobros ni ventas', () => {
  const op = {costo_transporte:0,costo_arriendo:0,costo_viaticos:0,costo_otros:0,costo_ayudante:0,costo_equipos:0,comision_vendedora_pct:10,comision_vendedora_base:'venta_total',ahorro_pct:20};
  const ventas = [{total:300000,pagos_abonos:[{monto:300000,medio_pago:'efectivo'}],venta_items:[]}];
  const antes = numerosDeOperativo(op,ventas,0,0,OG);
  const despues = numerosDeOperativo({...op,costo_fides_real:106000},ventas,0,0,OG);
  expect(despues.vendido).toBe(antes.vendido);
  expect(despues.cobrado).toBe(antes.cobrado);
  expect(despues.desglose.totalCristales).toBe(106000);
  expect(despues.cierre.gananciaLiquida).toBe(antes.cierre.gananciaLiquida-106000);
  expect(despues.cierre.montos.pablo).toBeLessThan(antes.cierre.montos.pablo);
});
