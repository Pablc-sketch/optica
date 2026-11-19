import {describe,it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/lib/cuenta-mercadopago',()=>({leerEstadoCuenta:vi.fn()}));
import CuentaBancaria from '../src/components/cuenta-bancaria';
const registrado={saldo:-45000,maquina:100000,transferencias:1000,salidas:140000,comisiones:6000};
const base={ultimaCorrecta:null,estado:'correcto',errorCodigo:null};
describe('comparación de la cuenta bancaria',()=>{
 it('contrasta el saldo externo cero con el libro sin ocultar la diferencia',async()=>{
  const s=renderToStaticMarkup(await CuentaBancaria({tenantId:'prueba',registrado,cuenta:{...base,saldo:{estado:'disponible',disponible:0,total:0,consultadoEn:'2026-11-01T12:00:00Z'}}}));
  expect(s).toContain('Diferencia por revisar');expect(s).toContain('45.000');expect(s).toContain('comisiones estimadas');
 });
 it('muestra la hora de corte y advierte que no equivale a conciliar todos los movimientos',async()=>{
  const s=renderToStaticMarkup(await CuentaBancaria({tenantId:'prueba',registrado,cuenta:{...base,saldo:{estado:'reporte',disponible:500,hasta:'2026-11-01T12:00:00Z',consultadoEn:'2026-11-01T12:05:00Z',vigente:false}}}));
  expect(s).toContain('Saldo al corte');expect(s).toContain('45.500');expect(s).toContain('Este saldo es anterior');expect(s).toContain('no confirma por sí sola todos los movimientos');
 });
 it('no inventa una diferencia cuando el saldo real no está disponible',async()=>{
  const s=renderToStaticMarkup(await CuentaBancaria({tenantId:'prueba',registrado,cuenta:{...base,saldo:{estado:'no_habilitado'}}}));
  expect(s).toContain('Saldo bancario no disponible');expect(s).not.toContain('Diferencia por revisar');
 });
});
