import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const ctx=vi.hoisted(()=>({diagnostico:vi.fn(),saldo:vi.fn(),archivo:vi.fn(),point:vi.fn(),conexion:vi.fn()}));
vi.mock('@/lib/mercadopago-reportes',()=>({diagnosticarAvisosMP:ctx.diagnostico,actualizarSaldoPorReporte:ctx.saldo,diagnosticarSaldoPorReporte:vi.fn(),silenciarReportesMP:vi.fn()}));
vi.mock('@/lib/mercadopago-sync',()=>({sincronizarMercadoPago:ctx.archivo}));
vi.mock('@/lib/mercadopago-point',()=>({sincronizarOrdenesPoint:ctx.point}));
vi.mock('@/lib/mercadopago-conexion',()=>({revisarConexionMP:ctx.conexion,integrarTerminalUnicaMP:vi.fn()}));
import {POST} from '../src/app/api/integraciones/mercadopago/sync/route';
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('MERCADOPAGO_SYNC_SECRET','secreto-ficticio');vi.stubEnv('MERCADOPAGO_TENANT_ID','tenant');ctx.diagnostico.mockResolvedValue({solo_lectura:true});});
afterEach(()=>vi.unstubAllEnvs());
const request=(token='secreto-ficticio')=>new Request('https://ejemplo.test/api/integraciones/mercadopago/sync',{method:'POST',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({diagnosticar_avisos:true,tarea_diagnostico:'456'})});
describe('diagnóstico aislado de Mercado Pago',()=>{
 it('termina sin ejecutar sincronización ni generación de reportes',async()=>{
  const respuesta=await POST(request());expect(respuesta.status).toBe(200);expect(await respuesta.json()).toEqual({solo_lectura:true});
  expect(ctx.diagnostico).toHaveBeenCalledWith('tenant','456');
  for(const fn of [ctx.saldo,ctx.archivo,ctx.point,ctx.conexion])expect(fn).not.toHaveBeenCalled();
 });
 it('exige autenticación también para solo lectura',async()=>{
  expect((await POST(request('incorrecto'))).status).toBe(401);expect(ctx.diagnostico).not.toHaveBeenCalled();
 });
 it('un fallo de diagnóstico no inicia sincronización como alternativa',async()=>{
  ctx.diagnostico.mockRejectedValueOnce(new Error('fallo'));expect((await POST(request())).status).toBe(503);
  for(const fn of [ctx.saldo,ctx.archivo,ctx.point,ctx.conexion])expect(fn).not.toHaveBeenCalled();
 });
});
