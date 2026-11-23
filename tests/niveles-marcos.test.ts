import {describe,it,expect} from 'vitest';
import {NIVELES_MARCO,RECARGOS_OPTICA_GLOBAL as T,leerRecargosMarcos,precioParConMarco} from '../src/lib/niveles-marco';
import {normalizarVenta,type ArmazonPedido,type ItemPedido} from '../src/lib/venta-normalizar';
import {lineaRecargo,validarRecargosVenta} from '../src/lib/recargos-venta';
import {aportePorPar,comisionHistorica} from '../src/lib/rentabilidad-precios';
import {quitarHuerfanos} from '../src/lib/carrito';
const cristal=(slot:number)=>({slot,tipoLente:'Monofocal',rangoReceta:'±2.00 / ±2.00',tratamiento:'Orgánico Antirreflejo'});
const normal=(marcos:ArmazonPedido[],items:ItemPedido[])=>normalizarVenta(marcos.map(m=>cristal(m.slot)),marcos,items);
const ar=(slot:number,nivelMarco:ArmazonPedido['nivelMarco']='seleccion',productoId:string|null=null)=>({slot,nivelMarco,productoId,marcoPropio:false,descripcion:'Acetato rojo'});
const ci=(slot:number,precioUnitario=38000)=>({descripcion:'Cristales',cantidad:1,precioUnitario,cristalSlot:slot});
const ex=(slot:number,nivel:'seleccion'|'premium'|'especial'='seleccion',gift=false)=>({...lineaRecargo(slot,nivel,T,gift),marcoSlot:slot});
function validar(marcos:ArmazonPedido[],items:ItemPedido[]){const n=normal(marcos,items);return n.ok?validarRecargosVenta(n.venta,T):n.error;}
describe('Precios únicos por cristal y línea de marco',()=>{
 it.each([[38000,49990,59990],[48000,59990,69990],[70000,81990,91990],[75000,86990,96990],[95000,106990,116990],[120000,131990,141990],[150000,161990,171990],[180000,191990,201990],[200000,211990,221990],[220000,231990,241990],[55000,66990,76990],[115000,126990,136990]])('base %i conserva diferencias también en tallados',(base,sel,prem)=>{
  expect(NIVELES_MARCO.map(n=>precioParConMarco(base,n.id,T))).toEqual([base,sel,prem,base+31990]);
 });
 it.each([null,{},[],{esencial:1,seleccion:11990,premium:21990},{esencial:0,seleccion:-1,premium:21990},{esencial:0,seleccion:11990.5,premium:21990},{esencial:0,seleccion:21990,premium:11990},{esencial:0,seleccion:'11990',premium:21990}])('rechaza configuración inválida %j',(v)=>expect(leerRecargosMarcos(v)).toBeNull());
 it('otras ópticas conservan incluido y premium anterior',()=>{expect(precioParConMarco(38000,'esencial',null)).toBe(38000);expect(precioParConMarco(38000,'premium',null)).toBe(48000);});
 it('lee la configuración válida',()=>expect(leerRecargosMarcos(T)).toEqual(T));
});
describe('Entradas a venta y validación del servidor',()=>{
 it.each(['seleccion','premium','especial'] as const)('inventario, descrito y solo par 2: %s',nivel=>{
   for(const producto of [null,'sku-a']){
    const n=normal([ar(2,nivel,producto)],[ci(2),ex(2,nivel)]);
    expect(n.ok).toBe(true);if(!n.ok)return;
    expect(n.venta.items[1].marcoSlot).toBe(1);expect(n.venta.marcoDeCupo[1]?.nivelMarco).toBe(nivel);
    expect(validarRecargosVenta(n.venta,T)).toBeNull();
   }
 });
 it('seis pares fuera de orden conservan marco y recargo',()=>{
  const slots=[6,4,2,5,1,3],n=normal(slots.map(s=>ar(s)),slots.flatMap(s=>[ci(s),ex(s)]));
  expect(n.ok).toBe(true);if(n.ok){expect(n.venta.cristales.map(c=>c.cupo)).toEqual([1,2,3,4,5,6]);expect(validarRecargosVenta(n.venta,T)).toBeNull();}
 });
 it('cortesía completa conserva línea sin cobrar marco',()=>expect(validar([ar(1,'premium')],[ci(1,0),ex(1,'premium',true)])).toBeNull());
 it('descuento del cristal conserva recargo correcto',()=>expect(validar([ar(1)],[ci(1,30000),ex(1)])).toBeNull());
 it('marco del paciente no lleva recargo',()=>expect(validar([{...ar(1,'esencial'),marcoPropio:true}],[ci(1)])).toBeNull());
 it('Esencial no necesita ítem extra',()=>expect(validar([ar(1,'esencial')],[ci(1)])).toBeNull());
 it('cola antigua sin línea sigue sincronizando',()=>expect(validar([{slot:1,productoId:null,marcoPropio:false}],[ci(1)])).toBeNull());
 it.each([
  [ci(1)], [ci(1),{...ex(1),precioUnitario:10000}], [ci(1),ex(1),ex(1)],
  [ci(1),{...ex(1),cantidad:2}], [ci(1),{...ex(1),productoId:'sku'}], [ci(1,0),ex(1)],
 ].map(items=>({items})))('detiene recargos incompletos, viejos o duplicados %j',({items})=>expect(validar([ar(1)],items as ItemPedido[])).toBeTruthy());
 it('no permite recargo Esencial',()=>expect(validar([ar(1,'esencial')],[ci(1),ex(1)])).toBeTruthy());
 it('rechaza recargo sin par',()=>expect(validar([ar(1)],[ci(1),ex(2)])).toBeTruthy());
 it('no permite marco propio Premium',()=>expect(validar([{...ar(1,'premium'),marcoPropio:true}],[ci(1)])).toBeTruthy());
 it('rechaza dos marcos por cupo',()=>expect(normal([ar(1),ar(1)],[ci(1)]).ok).toBe(false));
 it.each([0,-1,1.5,7])('rechaza cupo de recargo %s',slot=>expect(validar([ar(1)],[ci(1),ex(slot)])).toBeTruthy());
 it('quitar cristal elimina ambos marcos de recargo sin tocar otro par',()=>expect(quitarHuerfanos([{key:'cristal-2'},lineaRecargo(1,'seleccion',T),lineaRecargo(2,'premium',T)]).map(x=>x.key)).toEqual(['cristal-2','premium-2']));
});
describe('Rentabilidad realista por tipo de cristal',()=>{
 const perfil={id:'ar',nombre:'AR',precio:38000,costo:3975,origen:'stock'};
 it('IVA incluido deja 31.933, no 30.780',()=>expect(Math.round(38000/1.19)).toBe(31933));
 it('aplica tasas sobre montos, incluyendo efectivo sin comisión',()=>expect(comisionHistorica([{monto:100000,medio_pago:'debito'},{monto:100000,medio_pago:'credito'},{monto:200000,medio_pago:'efectivo'}],2.13,2.96)).toBeCloseTo(1.2725));
 it('sin historial no inventa tasa',()=>expect(comisionHistorica([],2.13,2.96)).toBeNull());
 it('el aporte paga viaje después de costos, comisiones y reserva',()=>{
  const n=aportePorPar(perfil,'esencial',T,6000,1000,10,2.13);
  expect(n.precio).toBe(38000);expect(n.operativo).toBeCloseTo(22415.6);expect(n.conReserva).toBeCloseTo(16348.3731,2);
 });
 it('subir línea mejora margen sin subir costo de cristal',()=>{
  const es=aportePorPar(perfil,'esencial',T,6000,1000,10,2.96),pr=aportePorPar(perfil,'premium',T,6000,1000,10,2.96);
  expect(pr.conReserva-es.conReserva).toBeCloseTo(21990*(1/1.19-.1296));
 });
});

describe("Precio de marco acordado en caja", () => {
  it.each([
    ["esencial", 3_000],
    ["seleccion", 6_990],
    ["especial", 25_000],
    ["premium", 0],
  ] as const)("permite editar %s sin perder el par", (nivel, precioUnitario) => {
    const marco = { ...ar(2, nivel, "producto-inventario"), recargoEditado: true };
    const extra = { ...lineaRecargo(2, nivel, T), marcoSlot: 2, precioUnitario };
    const n = normal([marco], [{ ...ci(2), descuento: 5_000 }, extra]);
    expect(n.ok).toBe(true);
    if (!n.ok) return;
    expect(validarRecargosVenta(n.venta, T)).toBeNull();
    expect(n.venta.items).toMatchObject([{ cristalSlot: 1, descuento: 5_000 }, { marcoSlot: 1, precioUnitario }]);
    expect(validar([marco], [ci(2), extra, extra])).toBeTruthy();
  });

  it("cobra el marco de lista aunque los cristales queden en cero en una venta nueva", () => {
    const marco = { ...ar(1, "premium"), recargoEditado: false };
    expect(validar([marco], [ci(1, 0), ex(1, "premium")])).toBeNull();
  });

  it("acepta el recargo histórico especial y la nueva edición en otra categoría", () => {
    const especiales = new Map([["propio-catalogo", 30_000]]);
    const antiguo = normal([ar(1, "premium", "propio-catalogo")], [ci(1), { ...ex(1, "premium"), precioUnitario: 30_000 }]);
    const actual = normal([{ ...ar(1, "premium", "propio-catalogo"), recargoEditado: false }], [ci(1), ex(1, "premium")]);
    for (const n of [antiguo, actual]) {
      expect(n.ok).toBe(true);
      if (n.ok) expect(validarRecargosVenta(n.venta, T, especiales)).toBeNull();
    }
  });

  it.each([-1, 1.5, 38_001])("rechaza descuento inválido %i", descuento => {
    expect(normal([ar(1)], [{ ...ci(1), descuento }, ex(1)]).ok).toBe(false);
  });
});
