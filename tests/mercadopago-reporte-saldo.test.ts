import {describe,it,expect} from 'vitest';
import {saldoDeReporteCSV,filasCSV} from '../src/lib/mercadopago-reporte-datos';
const cab='DATE,RECORD_TYPE,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,BALANCE_AMOUNT,CURRENCY';
const csv=(filas:string[])=>[cab,...filas].join('\r\n');
describe('saldo respaldado por reporte oficial',()=>{
 it('cuadra créditos, débitos y saldo final con centavos exactos',()=>{
  expect(saldoDeReporteCSV(csv(['2026-11-01,initial_available_balance,100.00,0.00,100.00,CLP','2026-11-01,release,0.00,80.20,19.80,CLP','2026-11-01,total,100.00,80.20,19.80,CLP']),'CLP')).toBe(19.8);
 });
 it('cero es saldo válido y no falta de datos',()=>{
  expect(saldoDeReporteCSV(csv(['2026-11-01,initial_available_balance,100,0,100,CLP','2026-11-01,release,0,100,0,CLP','2026-11-01,total,100,100,0,CLP']),'CLP')).toBe(0);
 });
 it('los saldos informativos pre/post retiro no se vuelven a sumar',()=>{
  expect(saldoDeReporteCSV(csv(['2026-11-01,initial_available_balance,100,0,100,CLP','2026-11-01,release,0,75,25,CLP','2026-11-01,available_balance,0,9999,9999,CLP']),'CLP')).toBe(25);
 });
 it('rechaza un cierre que no coincide con el reporte',()=>{
  expect(()=>saldoDeReporteCSV(csv(['2026-11-01,initial_available_balance,100,0,100,CLP','2026-11-01,total,100,0,200,CLP']),'CLP')).toThrow('No se pudo verificar');
 });
 it('no presenta como actuales las liberaciones fechadas después de la instantánea',()=>{
  const texto=csv(['2026-11-01T03:00:00Z,initial_available_balance,100,0,100,CLP','2026-11-01T18:00:00Z,release,20,0,120,CLP','2026-11-02T02:59:59Z,total,120,0,120,CLP']);
  expect(()=>saldoDeReporteCSV(texto,'CLP','2026-11-01T16:00:00Z')).toThrow();
  expect(saldoDeReporteCSV(texto,'CLP','2026-11-01T19:00:00Z')).toBe(120);
 });
 it('rechaza reportes incompletos, otra moneda y cifras ambiguas',()=>{
  for(const texto of [csv(['2026-11-01,release,1,0,1,CLP']),csv(['2026-11-01,initial_available_balance,1,0,1,USD']),csv(['2026-11-01,initial_available_balance,1.234,0,1,CLP']),csv(['2026-11-01,initial_available_balance,,,,CLP'])])expect(()=>saldoDeReporteCSV(texto,'CLP')).toThrow();
  expect(()=>saldoDeReporteCSV(csv(['2026-11-01,initial_available_balance,100,0,100,CLP']),'USD')).toThrow();
 });
 it('rechaza saldos iniciales repetidos y tipos desconocidos',()=>{
  const inicial='2026-11-01,initial_available_balance,100,0,100,CLP';
  expect(()=>saldoDeReporteCSV(csv([inicial,inicial]),'CLP')).toThrow();
  expect(()=>saldoDeReporteCSV(csv([inicial,'2026-11-01,desconocido,1,0,101,CLP']),'CLP')).toThrow();
 });
 it('lee CSV con comillas, BOM y separador de punto y coma',()=>{
  const texto='\uFEFF'+csv(['2026-11-01,initial_available_balance,100,0,100,CLP']).replaceAll(',',';');
  expect(saldoDeReporteCSV(texto,'CLP')).toBe(100);
  expect(filasCSV('A,B\n"a,b","c""d"')).toEqual([['A','B'],['a,b','c"d']]);
  expect(()=>filasCSV('A,B\n"incompleto,1')).toThrow();
 });
});
