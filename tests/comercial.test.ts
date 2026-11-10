import {describe,it,expect} from 'vitest';
import {costoParPropio} from '@/lib/precios-comerciales';
import {timbreDeReceta} from '@/lib/timbre-receta';
import {desglosarCostos} from '@/lib/costo-venta';
import {costoRealCristal,precioVentaCristal,type FilaCristal} from '@/lib/precio-venta';
import {rangoParaPosicion} from '@/lib/cristales';
import {seCruzanReservas} from '@/lib/disponibilidad-equipo';
import {leerTurno} from '@/lib/agenda-terreno';
const tech={nombre:'Tecnólogo emisor',rut:'11111111-1',titulo_profesional:'Tecnólogo Médico',registro_profesional:'REG-1'},otro={...tech,nombre:'Otro usuario que imprime'};
describe('Lentia comercial',()=>{
 it('el timbre pertenece a la receta, aunque imprima otra persona',()=>{expect(timbreDeReceta(tech,otro)?.nombre).toBe('Tecnólogo emisor');expect(timbreDeReceta(null,tech)?.nombre).toBe('Tecnólogo emisor');expect(timbreDeReceta(null,null)).toBeNull();});
 it('calcula tarifa por cristal o par sin duplicar montaje ni impuesto',()=>{expect(costoParPropio(10000,'unidad',3000,19)).toBe(27370);expect(costoParPropio(20000,'par',3000,19)).toBe(27370);expect(costoParPropio(27370,'par',0,0)).toBe(27370);expect(()=>costoParPropio(-1,'par',0,19)).toThrow();});
 it('cuenta el marco comercial una vez y conserva el costo histórico',()=>{
  expect(desglosarCostos([{cantidad:1,cristal_slot:1,costo_marco_snapshot:0,ordenes_trabajo:{costo_laboratorio:18000,costo_laboratorio_2:null}},{cantidad:1,costo_producto_snapshot:7300,costo_marco_snapshot:0,productos:{categoria:'armazon',costo:9900}}])).toMatchObject({totalCristales:18000,totalArmazones:7300,marcos:1,total:25300});
  expect(desglosarCostos([{cantidad:1,ordenes_trabajo:{costo_laboratorio:18000,costo_laboratorio_2:null}}]).totalArmazones).toBe(5000);
 });
 it('cotiza su tarifa sin catálogo compartido',()=>{expect(costoRealCristal({catalogo_propio:true,costo:27370} as FilaCristal,null,'lejos',{stock:[],laboratorio:[],montaje:[],recargos:[],promociones:[],descuentoPct:0},'2035-01-01')?.costo).toBe(27370);});
 it('usa rangos propios y rechaza recetas fuera de cobertura',()=>{
  const filas=[{catalogo_propio:true,rango_receta:'±3.00 / ±1.00'},{catalogo_propio:true,rango_receta:'±8.00 / ±3.00'}];
  expect(rangoParaPosicion([5,2],[0,-2],[null,null],'lejos',filas)).toBe('±8.00 / ±3.00');expect(rangoParaPosicion([9,2],[0,-2],[null,null],'lejos',filas)).toBe('Fuera del catálogo');expect(rangoParaPosicion([2,2],[0,-1],[2,2],'cerca',filas)).toBe('±8.00 / ±3.00');
 });
 it('respeta un precio propio cero sin multiplicarlo por el costo',()=>{expect(precioVentaCristal({catalogo_propio:true,tipo_lente:'Monofocal',costo:18000,precio_venta:0,precio_venta_stock:null},'laboratorio',6)).toBe(0);});
 it('permite reservas contiguas y bloquea noches intermedias',()=>{
  const a={fecha:'2035-03-10',fecha_fin:'2035-03-12',hora_inicio:null,hora_fin:null};expect(seCruzanReservas(a,{fecha:'2035-03-11',fecha_fin:null,hora_inicio:'22:00',hora_fin:'23:00'})).toBe(true);expect(seCruzanReservas(a,{fecha:'2035-03-13',fecha_fin:null,hora_inicio:null,hora_fin:null})).toBe(false);
 });
 it('acepta jornadas completas y rechaza horas parciales',()=>{
  const f=new FormData(),id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';for(const[k,v]of Object.entries({id,nombre:'Ficticio',direccion:'Lugar ficticio',fecha:'2035-03-10',fecha_fin:'2035-03-12',inicio:'',fin:'',vendedora:id,tecnologo:id,coordinador:id,kit:id}))f.set(k,v);expect(leerTurno(f).inicio).toBe('');f.set('inicio','09:00');expect(()=>leerTurno(f)).toThrow();
 });
});
