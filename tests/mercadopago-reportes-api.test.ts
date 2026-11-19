import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
const ctx=vi.hoisted(()=>({fila:{} as Record<string,unknown>,updates:[] as Record<string,unknown>[]}));
vi.mock('../src/lib/mercadopago-sync',()=>({mercadoPagoConfigurado:()=>true}));
vi.mock('../src/lib/supabase/admin',()=>({createAdminClient:()=>({
 rpc:async()=>({data:true}),
 from:(tabla:string)=>({
  select:()=>({eq:()=>({single:async()=>({data:tabla==='mercadopago_sync'?{collector_id:'123'}:ctx.fila})})}),
  update:(v:Record<string,unknown>)=>({eq:()=>({eq:async()=>{ctx.updates.push(v);return {error:null};}})})
 })
})}));
import {actualizarSaldoPorReporte} from '../src/lib/mercadopago-reportes';
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status});
beforeEach(()=>{ctx.fila={};ctx.updates=[];vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN','ficticio-servidor');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('reportes oficiales y configuración',()=>{
 it('crea configuración completa sin activar envíos ni reportes programados',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json({error:'not_found'},404)).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({id:456},202));
  vi.stubGlobal('fetch',fetcher);
  expect(await actualizarSaldoPorReporte('tenant')).toEqual({estado:'preparando'});
  const config=JSON.parse(fetcher.mock.calls[2][1].body);
  expect(config).toMatchObject({execute_after_withdrawal:false,include_withdrawal_at_end:true,frequency:{hour:0,type:'monthly',value:1}});
  expect(config).not.toHaveProperty('notification_email_list');
  expect(config).not.toHaveProperty('scheduled');
  const periodo=JSON.parse(fetcher.mock.calls[3][1].body);
  expect(periodo.begin_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  expect(periodo.end_date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  expect(Date.parse(periodo.end_date)-Date.parse(periodo.begin_date)).toBe(86400000);
  expect(ctx.updates).toContainEqual({tarea_id:'456'});
 });
 it('conserva preferencias existentes al agregar columnas necesarias',async()=>{
  const config={columns:[{key:'SOURCE_ID'}],file_name_prefix:'propio',frequency:{hour:8,value:1,type:'daily'},execute_after_withdrawal:true,include_withdrawal_at_end:false,notification_email_list:['ejemplo@example.com'],scheduled:true};
  const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json(config)).mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({id:456},202));
  vi.stubGlobal('fetch',fetcher);await actualizarSaldoPorReporte('tenant');
  const enviado=JSON.parse(fetcher.mock.calls[2][1].body);
  expect(enviado).toMatchObject({file_name_prefix:'propio',frequency:config.frequency,execute_after_withdrawal:true,notification_email_list:config.notification_email_list});
  expect(enviado.columns).toContainEqual({key:'SOURCE_ID'});
  expect(enviado.columns).toContainEqual({key:'NET_DEBIT_AMOUNT'});
  expect(enviado).not.toHaveProperty('scheduled');
 });
 it('permite solicitar un cierre anterior sin darle una fecha actual al saldo histórico',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-19T18:00:00Z'));
  try{
   ctx.fila={tarea_id:'456',estado:'preparando'};
   const columnas=['DATE','RECORD_TYPE','NET_CREDIT_AMOUNT','NET_DEBIT_AMOUNT'].map(key=>({key}));
   const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json({columns:columnas})).mockResolvedValueOnce(json({id:789},202));
   vi.stubGlobal('fetch',fetcher);
   expect(await actualizarSaldoPorReporte('tenant',{cierreAnterior:true})).toEqual({estado:'preparando'});
   expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({begin_date:'2026-10-20T03:00:00Z',end_date:'2026-11-19T02:59:59Z'});
   expect(ctx.updates.some(v=>'saldo_disponible' in v)).toBe(false);
  }finally{vi.useRealTimers();}
 });
 it('no convierte rechazo de configuración en saldo cero ni crea un reporte',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json({error:'not_found'},404)).mockResolvedValueOnce(json({error:'invalid_execute_after_withdrawal'},400));
  vi.stubGlobal('fetch',fetcher);
  expect(await actualizarSaldoPorReporte('tenant')).toMatchObject({estado:'error',codigo:'CONFIG_POST_HTTP_400_invalid_execute_after_withdrawal'});
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(ctx.updates.some(v=>'saldo_disponible' in v)).toBe(false);
 });
 it('no importa reportes de otra cuenta y conserva el saldo previo',async()=>{
  ctx.fila={tarea_id:'456',periodo_desde:'2025-12-31T12:00:00Z',periodo_hasta:'2026-01-01T12:00:00Z',estado:'preparando'};
  const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json({id:456,user_id:999,currency_id:'CLP',is_test:false,end_date:ctx.fila.periodo_hasta,status:'processed'}));
  vi.stubGlobal('fetch',fetcher);
  expect(await actualizarSaldoPorReporte('tenant')).toMatchObject({estado:'error',codigo:'REPORTE_NO_COINCIDE'});
  expect(ctx.updates.some(v=>'saldo_disponible' in v)).toBe(false);
 });
 it('acepta normalización a días completos y fecha el saldo con la generación, sin un cierre futuro',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-01-01T16:00:00Z'));
  try{
   ctx.fila={tarea_id:'456',periodo_desde:'2025-12-31T12:00:00Z',periodo_hasta:'2026-01-01T12:00:00Z',solicitado_en:'2026-01-01T12:02:00Z',estado:'error'};
   const fetcher=vi.fn().mockResolvedValueOnce(json({id:123})).mockResolvedValueOnce(json({id:456,user_id:123,currency_id:'CLP',is_test:false,begin_date:'2025-12-31T03:00:00Z',end_date:'2026-01-02T02:59:59Z',generation_date:'2026-01-01T12:02:00Z',last_modified:'2026-01-01T12:03:00Z',status:'processed',file_name:'prueba.csv'})).mockResolvedValueOnce(new Response('DATE,RECORD_TYPE,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT\n2025-12-31T03:00:00Z,initial_available_balance,100,0\n2026-01-01T12:01:00Z,release,0,100\n2026-01-02T02:59:59Z,total,100,100'));
   vi.stubGlobal('fetch',fetcher);
   expect(await actualizarSaldoPorReporte('tenant')).toEqual({estado:'verificado',saldo:0});
   expect(ctx.updates).toContainEqual(expect.objectContaining({saldo_disponible:0,saldo_al:'2026-01-01T12:03:00.000Z'}));
  }finally{vi.useRealTimers();}
 });
});
