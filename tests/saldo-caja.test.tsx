import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import SaldoCaja from '../src/components/saldo-caja';
describe('saldo de caja desde fuentes reales',()=>{
 it('suma banco y efectivo sin incorporar deuda personal ni el libro estimado',()=>{
  const s=renderToStaticMarkup(<SaldoCaja efectivo={5000} saldo={{estado:'disponible',disponible:25000,total:30000,consultadoEn:'2026-11-01T12:00:00Z'}}/>);
  expect(s).toContain('$30.000');expect(s).toContain('Mercado Pago + efectivo');expect(s).not.toContain('45.000');
 });
 it('cero real es válido y no sustituye una cuenta o conteo no verificados',()=>{
  const saldo={estado:'disponible' as const,disponible:0,total:0,consultadoEn:'2026-11-01T12:00:00Z'};
  expect(renderToStaticMarkup(<SaldoCaja efectivo={0} saldo={saldo}/>)).toContain('$0');
  expect(renderToStaticMarkup(<SaldoCaja efectivo={null} saldo={saldo}/>)).toContain('Por verificar');
  expect(renderToStaticMarkup(<SaldoCaja efectivo={0} saldo={{estado:'error'}}/>)).toContain('Saldo en vivo por verificar');
 });
 it('distingue el último saldo y una consulta pausada de una actualización actual',()=>{
  const s=renderToStaticMarkup(<SaldoCaja efectivo={0} saldo={{estado:'reporte',disponible:425,hasta:'2026-11-20T02:12:12Z',consultadoEn:'2026-11-20T02:15:00Z',vigente:false,reportesPausados:true}}/>);
  expect(s).toContain('$425');expect(s).toContain('Último saldo');expect(s).toContain('Consulta del saldo pausada');expect(s).not.toContain('mercadopago.cl');
 });
 it('identifica el saldo anterior cuando el reporte requiere una actualización',()=>{
  const s=renderToStaticMarkup(<SaldoCaja efectivo={0} saldo={{estado:'reporte',disponible:7000,hasta:'2026-11-01T12:00:00Z',consultadoEn:'2026-11-01T12:05:00Z',vigente:false}}/>);
  expect(s).toContain('Saldo en vivo por verificar');
  expect(s).toContain('$7.000');
  expect(s).toContain('Último saldo del reporte');
  expect(s).not.toContain('Mercado Pago + efectivo');
 });
});
