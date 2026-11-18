import {describe,it,expect} from 'vitest';
import {impuestoDeMes,resumirImpuestos,mesesDesde,validarMesImpuesto,type MesImpuesto} from '../src/lib/impuestos';
const mes:MesImpuesto={periodo:'2026-09-01',ventas_afectas:null,credito_fiscal:0,ppm:0,otros:0,recargos:0,total_declarado:null,vence_el:null,nota:'',version:0};
describe('control mensual SII',()=>{
 it('reserva IVA desde el bruto sin confundirlo con deuda oficial',()=>{
  const n=impuestoDeMes(mes,119000,0,'2026-11-18');
  expect(n.debito).toBe(19000);expect(n.saldo).toBe(19000);expect(n.declarado).toBe(false);expect(n.vencido).toBe(false);
 });
 it('usa crédito confirmado y PPM ingresado sin asumir tasa',()=>{
  const n=impuestoDeMes({...mes,credito_fiscal:9000,ppm:1000,otros:500,recargos:100},119000,0,'2026-11-18');
  expect(n.total).toBe(11600);
 });
 it('crédito superior al débito no se inventa como devolución',()=>expect(impuestoDeMes({...mes,credito_fiscal:30000},119000,0,'2026-11-18').iva).toBe(0));
 it('total F29 declarado reemplaza la estimación sin duplicar recargos',()=>{
  const n=impuestoDeMes({...mes,total_declarado:22000,recargos:3000,vence_el:'2026-10-20'},119000,5000,'2026-11-18');
  expect(n.total).toBe(22000);expect(n.saldo).toBe(17000);expect(n.vencido).toBe(true);
 });
 it('suma meses pendientes una sola vez y separa reservas',()=>{
  const a=impuestoDeMes({...mes,total_declarado:10000},0,3000,'2026-11-18');
  const b=impuestoDeMes({...mes,periodo:'2026-10-01',total_declarado:20000},0,0,'2026-11-18');
  const c=impuestoDeMes({...mes,periodo:'2026-11-01'},119000,0,'2026-11-18');
  expect(resumirImpuestos([a,b,c])).toEqual({declarado:27000,estimado:19000,vencido:0,pagado:3000});
 });
 it('un pago extra no genera deuda negativa ni paga otro mes',()=>{
  const n=impuestoDeMes({...mes,total_declarado:10000},0,15000,'2026-11-18');
  expect(n.saldo).toBe(0);expect(n.extra).toBe(5000);
 });
 it('un cero declarado es distinto a no saber el importe',()=>expect(impuestoDeMes({...mes,total_declarado:0},119000,0,'2026-11-18').total).toBe(0));
 it('no vence antes de la fecha confirmada',()=>expect(impuestoDeMes({...mes,total_declarado:10000,vence_el:'2026-12-20'},0,0,'2026-11-18').vencido).toBe(false));
 it('permite corregir la base afecta por ventas exentas',()=>expect(impuestoDeMes({...mes,ventas_afectas:0},119000,0,'2026-11-18').total).toBe(0));
 it('genera meses corridos incluidos los sin ventas',()=>expect(mesesDesde('2026-11-13','2027-02-03')).toEqual(['2026-11-01','2026-12-01','2027-01-01','2027-02-01']));
 it('rechaza períodos futuros, importes negativos y fechas inexistentes',()=>{
  expect(validarMesImpuesto({...mes,periodo:'2026-12-01'},'2026-11-18')).toBeTruthy();
  expect(validarMesImpuesto({...mes,credito_fiscal:-1},'2026-11-18')).toBeTruthy();
  expect(validarMesImpuesto({...mes,vence_el:'2026-02-30'},'2026-11-18')).toBeTruthy();
 });
});
