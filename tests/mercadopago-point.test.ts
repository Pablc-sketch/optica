import {describe,it,expect} from 'vitest';
import {pagoConfirmadoDeOrden,type OrdenPoint} from '../src/lib/mercadopago-point-datos';
import {efectivoDesdeConteo,prioridadCaja} from '../src/lib/caja-verificada';
const c:OrdenPoint={id:'intento',tenant_id:'tenant',venta_id:'venta',actor_id:'actor',monto:50000,terminal_id:'NEWLAND__12345',collector_id:'1234',order_id:'ORD12345',pago_id:null,estado:'created',creado_en:'2026-11-19T10:00:00Z',confirmado_en:null};
const orden=()=>({id:c.order_id,type:'point',user_id:'1234',currency:'CLP',external_reference:'lentia-intento',config:{point:{terminal_id:c.terminal_id}},status:'processed',transactions:{payments:[{amount:'50000',paid_amount:'50000',status:'processed',reference_id:'1234567890'}]}});
describe('Point: prueba de la compra, cuenta y pago',()=>{
 it('usa la operación de pago real del proveedor, sin confundir el ID ORD con el voucher',()=>expect(pagoConfirmadoDeOrden(orden(),c)).toBe('1234567890'));
 it('también reconoce referencia anidada documentada',()=>{const o=orden();const p=o.transactions.payments[0] as Record<string,unknown>;delete p.reference_id;p.reference={id:'1234567890'};expect(pagoConfirmadoDeOrden(o,c)).toBe('1234567890');});
 it.each(['created','at_terminal','action_required','failed','canceled','expired','refunded'])('no crea un abono con estado %s',estado=>expect(pagoConfirmadoDeOrden({...orden(),status:estado},c)).toBeNull());
 it.each([{user_id:'ajeno'},{currency:'USD'},{external_reference:'otra-compra'},{id:'OTRA'},{config:{point:{terminal_id:'OTRA'}}}])('rechaza orden ajena o cambiada %o',cambio=>expect(()=>pagoConfirmadoDeOrden({...orden(),...cambio},c)).toThrow());
 it('rechaza diferencias, devoluciones y voucher faltante',()=>{for(const cambio of [{amount:'49999'},{refunded_amount:'1'},{paid_amount:'49999'},{reference_id:''}]){const o=orden();Object.assign(o.transactions.payments[0],cambio);expect(()=>pagoConfirmadoDeOrden(o,c)).toThrow();}});
});
describe('liquidez comprobada y capital personal',()=>{
 it('un conteo cero conserva la diferencia histórica sin fabricar salidas',()=>{expect(efectivoDesdeConteo(123000,{contado:0,esperado:123000})).toBe(0);expect(efectivoDesdeConteo(133000,{contado:0,esperado:123000})).toBe(10000);});
 it('sin conteo o banco confirmado no transforma el libro en liquidez',()=>{expect(efectivoDesdeConteo(100)).toBeNull();expect(prioridadCaja(0,null,150000).total).toBeNull();});
 it('reserva el reintegro antes de repartir, sin descontarlo como otro gasto',()=>expect(prioridadCaja(10000,200000,150000)).toEqual({total:210000,paraDevolver:150000,paraRepartir:60000}));
});
