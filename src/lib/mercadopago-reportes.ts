import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {consultarApiMP,ErrorMercadoPago} from '@/lib/mercadopago-api';
import {idMercadoPago} from '@/lib/mercadopago-datos';
import {ReporteMPInvalido,saldoDeReporteCSV} from '@/lib/mercadopago-reporte-datos';
import {hoyEnChile,inicioDelDia,restarDias} from '@/lib/fechas';
const BASE='/v1/account/release_report';
const COLUMNAS=['DATE','RECORD_TYPE','NET_CREDIT_AMOUNT','NET_DEBIT_AMOUNT'];
class ErrorReporteAPI extends ErrorMercadoPago {
 constructor(public status:number,etapa:string,public proveedor:string){super(`${etapa}_HTTP_${status}${proveedor?'_'+proveedor:''}`.slice(0,100));}
}
async function reporteJSON(path:string,init:RequestInit={}){
 const r=await fetch(`https://api.mercadopago.com${path}`,{...init,headers:{Authorization:`Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`,'Content-Type':'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!r.ok||r.status===203){
  const body:unknown=await r.json().catch(()=>null);
  const d=body&&typeof body==='object'?body as Record<string,unknown>:{};
  const raw=d.error??d.code;
  let code=typeof raw==='string'&&/^[a-zA-Z0-9_-]{1,55}$/.test(raw)?raw:'';
  if(!code&&typeof d.message==='string'&&/not found|does not exist|no.*config/i.test(d.message))code='CONFIG_NOT_FOUND';
  const etapa=path.endsWith('/config')?`CONFIG_${init.method??'GET'}`:'REPORTE';
  throw new ErrorReporteAPI(r.status,etapa,code);
 }
 return await r.json() as unknown;
}
function avisosDesactivados(raw:unknown,permitirAusente=false){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const lista=(raw as Record<string,unknown>).notification_email_list;
 return Array.isArray(lista)?lista.length===0:permitirAusente&&lista===undefined;
}
async function configurarColumnas(){
 let raw:unknown;
 try{raw=await reporteJSON(`${BASE}/config`);}catch(e){if(!(e instanceof ErrorReporteAPI)||!(e.status===404||e.status===400&&/not_found|config_not|no_config/i.test(e.proveedor)))throw e;}
 if(!raw){
  await reporteJSON(`${BASE}/config`,{method:'POST',body:JSON.stringify({file_name_prefix:'lentia-saldo',columns:COLUMNAS.map(key=>({key})),frequency:{hour:0,type:'monthly',value:1},execute_after_withdrawal:false,include_withdrawal_at_end:true,check_available_balance:false,compensate_detail:false,separator:';',display_timezone:'GMT-03',report_translation:'es',notification_email_list:[]})});
 }else{
  const config=raw as {columns?:{key?:unknown}[]};
  if(!Array.isArray(config.columns))throw new ReporteMPInvalido('CONFIGURACION_INVALIDA');
  const columnas=config.columns.filter(c=>typeof c.key==='string').map(c=>({key:String(c.key)}));
  if(COLUMNAS.every(k=>columnas.some(c=>c.key===k))&&avisosDesactivados(raw))return;
  for(const k of COLUMNAS)if(!columnas.some(c=>c.key===k))columnas.push({key:k});
  // Conserva preferencias y columnas, pero desactiva expresamente los correos.
  const preferencias:Record<string,unknown>={columns:columnas,notification_email_list:[]};
  for(const k of ['file_name_prefix','frequency','execute_after_withdrawal','include_withdrawal_at_end','check_available_balance','compensate_detail','separator','display_timezone','report_translation','sftp_info','webhook'])if(k in config)preferencias[k]=(raw as Record<string,unknown>)[k];
  await reporteJSON(`${BASE}/config`,{method:'PUT',body:JSON.stringify(preferencias)});
 }
 // No genera otro reporte si el proveedor no confirma que los avisos están apagados.
 // La API omite notification_email_list cuando la lista guardada está vacía.
 // Solo se acepta esa omisión después de un POST/PUT explícito con [].
 if(!avisosDesactivados(await reporteJSON(`${BASE}/config`),true))throw new ReporteMPInvalido('AVISOS_DE_REPORTE_ACTIVOS');
}

// Mantenimiento interno autenticado: no genera reportes ni expone destinatarios.
export async function silenciarReportesMP(tenant:string){
 if(!mercadoPagoConfigurado(tenant))throw new ReporteMPInvalido('SIN_CONFIGURAR');
 const {data:sync,error}=await createAdminClient().from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
 if(error||!sync?.collector_id||idMercadoPago((await consultarApiMP('/users/me')).id)!==String(sync.collector_id))throw new ReporteMPInvalido('CUENTA_NO_COINCIDE');
 try{await configurarColumnas();return {avisos_reportes:'desactivados',destinatarios:0};}
 catch(e){
  const codigo=e instanceof ErrorMercadoPago||e instanceof ReporteMPInvalido?e.codigo:'CONSULTA_FALLIDA';
  const raw=await reporteJSON(`${BASE}/config`).catch(()=>null);
  const config=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
  const lista=config.notification_email_list;
  return {avisos_reportes:'sin_confirmar',codigo,destinatarios:Array.isArray(lista)?lista.length:null,lista_tipo:lista===null?'null':typeof lista,campos:Object.keys(config).filter(k=>/^[a-z_]{1,40}$/.test(k))};
 }
}
function validarMeta(raw:unknown,collector:string,desde:string,hasta:string,tarea:string){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new ReporteMPInvalido('METADATA_INVALIDA');
 const m=raw as Record<string,unknown>;
 if(idMercadoPago(m.id)!==tarea)throw new ReporteMPInvalido('REPORTE_TAREA_NO_COINCIDE');
 if(!idMercadoPago(m.user_id))throw new ReporteMPInvalido('REPORTE_SIN_TITULAR');
 if(idMercadoPago(m.user_id)!==collector)throw new ReporteMPInvalido('REPORTE_NO_COINCIDE');
 if(m.currency_id!=='CLP')throw new ReporteMPInvalido(`REPORTE_MONEDA_${typeof m.currency_id==='string'&&/^[A-Z]{3}$/.test(m.currency_id)?m.currency_id:'NO_INFORMADA'}`);
 if(m.is_test!==false)throw new ReporteMPInvalido('REPORTE_SIN_CONFIRMAR_PRODUCCION');
 if(typeof m.end_date!=='string'||!Number.isFinite(Date.parse(m.end_date))||typeof m.begin_date!=='string'||!Number.isFinite(Date.parse(m.begin_date)))throw new ReporteMPInvalido('REPORTE_SIN_PERIODO');
 // Mercado Pago normaliza la selección a días completos de la cuenta.
 const dia=(f:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(f));
 if(dia(m.begin_date)!==dia(desde)||dia(m.end_date)!==dia(hasta)||Date.parse(m.begin_date)>=Date.parse(m.end_date))throw new ReporteMPInvalido('REPORTE_PERIODO_NO_COINCIDE');
 return m;
}
export async function actualizarSaldoPorReporte(tenant:string,opciones:{cierreAnterior?:boolean}={}){
 if(!mercadoPagoConfigurado(tenant))return;
 const db=createAdminClient();
 const {data:sync,error:errSync}=await db.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
 if(errSync||!sync?.collector_id)return;
 const collector=String(sync.collector_id);
 const {data:lease,error:errLease}=await db.rpc('mercadopago_reservar_saldo',{p_tenant:tenant,p_collector:collector});
 if(errLease||!lease)return;
 const guardar=async(valores:Record<string,unknown>)=>{const {error}=await db.from('mercadopago_saldos').update(valores).eq('tenant_id',tenant).eq('collector_id',collector);if(error)throw new Error('No se pudo guardar el saldo consultado.');};
 try{
  if(idMercadoPago((await consultarApiMP('/users/me')).id)!==collector)throw new ReporteMPInvalido('CUENTA_NO_COINCIDE');
  const {data:r,error}=await db.from('mercadopago_saldos').select('*').eq('tenant_id',tenant).single();
  if(error||!r)throw new ReporteMPInvalido('REGISTRO_NO_DISPONIBLE');
  if(!opciones.cierreAnterior&&r.tarea_id&&r.periodo_hasta&&r.estado!=='verificado'){
   const meta=validarMeta(await reporteJSON(`${BASE}/task/${r.tarea_id}`),collector,r.periodo_desde,r.periodo_hasta,r.tarea_id);
   if(['pending','taken','processing','created','scheduled','data-ready'].includes(String(meta.status))){await guardar({estado:'preparando',error_codigo:null});return;}
   if(meta.status!=='processed')throw new ReporteMPInvalido(`GENERACION_${typeof meta.status==='string'&&/^[a-z_]{1,35}$/.test(meta.status)?meta.status:'ESTADO_INVALIDO'}`);
   const actualizado=typeof meta.last_modified==='string'?Date.parse(meta.last_modified):NaN;
   const generado=typeof meta.generation_date==='string'?Date.parse(meta.generation_date):NaN;
   if(!Number.isFinite(generado)||!Number.isFinite(actualizado)||actualizado<generado||actualizado>Date.now()||generado<Date.parse(r.solicitado_en)-60000)throw new ReporteMPInvalido('FECHA_GENERACION_INVALIDA');
   // Un período abierto tiene saldo de instantánea, nunca un cierre futuro.
   const corte=new Date(Math.min(Date.parse(String(meta.end_date)),actualizado)).toISOString();
   if(typeof meta.file_name!=='string'||!/^[-A-Za-z0-9_.]+\.csv$/i.test(meta.file_name))throw new ReporteMPInvalido('ARCHIVO_NO_CSV');
   const resp=await fetch(`https://api.mercadopago.com${BASE}/${encodeURIComponent(meta.file_name)}`,{headers:{Authorization:`Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(20000)});
   if(!resp.ok)throw new ErrorMercadoPago(`DESCARGA_HTTP_${resp.status}`);
   if(Number(resp.headers.get('content-length')??0)>5_000_000)throw new ReporteMPInvalido('ARCHIVO_GRANDE');
   const texto=await resp.text();
   const saldo=saldoDeReporteCSV(texto,String(meta.currency_id),corte);
   // Un cierre anterior no puede reemplazar una instantánea más reciente.
   if(r.saldo_al&&Date.parse(corte)<=Date.parse(r.saldo_al)){
    await guardar({estado:'verificado',error_codigo:null});
    return {estado:'verificado',saldo:Number(r.saldo_disponible)};
   }
   await guardar({estado:'verificado',saldo_disponible:saldo,saldo_al:corte,verificado_en:new Date().toISOString(),reporte_id:String(meta.report_id??meta.id),error_codigo:null});
   return {estado:'verificado',saldo};
  }
  // Una tarea a la vez; se solicita otra cuando se completa y pasan 5 minutos.
  if(!opciones.cierreAnterior&&r.solicitado_en&&Date.now()-Date.parse(r.solicitado_en)<5*60000)return;
  await guardar({solicitado_en:new Date().toISOString()});
  await configurarColumnas();
  // La API de reportes exige UTC a segundos (rechaza fracciones de segundo).
  const hasta=new Date(opciones.cierreAnterior?Date.parse(inicioDelDia(hoyEnChile()))-1000:Date.now()-120000).toISOString().replace(/\.\d{3}Z$/,'Z');
  const desde=(opciones.cierreAnterior?inicioDelDia(restarDias(hoyEnChile(),30)):new Date(Date.parse(hasta)-86400000).toISOString()).replace(/\.\d{3}Z$/,'Z');
  await guardar({estado:'preparando',solicitado_en:new Date().toISOString(),periodo_desde:desde,periodo_hasta:hasta,tarea_id:null,error_codigo:null});
  const raw=await reporteJSON(BASE,{method:'POST',body:JSON.stringify({begin_date:desde,end_date:hasta})});
  if(!raw||typeof raw!=='object')throw new ReporteMPInvalido('SOLICITUD_INVALIDA');
  const id=idMercadoPago((raw as Record<string,unknown>).id);
  if(!id)throw new ReporteMPInvalido('TAREA_NO_IDENTIFICADA');
  await guardar({tarea_id:id});
  return {estado:'preparando'};
 }catch(e){
  const codigo=e instanceof ErrorMercadoPago||e instanceof ReporteMPInvalido?e.codigo:'CONSULTA_FALLIDA';
  await guardar({estado:/HTTP_(401|403)/.test(codigo)?'sin_permiso':'error',error_codigo:codigo});
  return {estado:'error',codigo};
 }finally{await guardar({bloqueado_hasta:null});}
}

// Diagnóstico de solo lectura para el endpoint interno autenticado. No devuelve
// credenciales, datos de pagadores ni el contenido del archivo bancario.
export async function diagnosticarSaldoPorReporte(tenant:string){
 if(!mercadoPagoConfigurado(tenant))return null;
 const db=createAdminClient();
 const {data:r}=await db.from('mercadopago_saldos').select('collector_id,tarea_id').eq('tenant_id',tenant).maybeSingle();
 if(!r?.tarea_id||idMercadoPago((await consultarApiMP('/users/me')).id)!==r.collector_id)return null;
 const raw=await reporteJSON(`${BASE}/task/${r.tarea_id}`);
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {error:'METADATA_INVALIDA'};
 const m=raw as Record<string,unknown>;
 const resultado:Record<string,unknown>={titular_coincide:idMercadoPago(m.user_id)===r.collector_id};
 for(const k of ['status','currency_id','format'])resultado[k]=typeof m[k]==='string'?String(m[k]).slice(0,100):null;
 resultado.status_tipo=typeof m.status;
 resultado.campos=Object.keys(m).filter(k=>/^[a-z_]{1,40}$/.test(k)).slice(0,40);
 if(m.status&&typeof m.status==='object')resultado.status_campos=Object.keys(m.status).filter(k=>/^[a-z_]{1,40}$/.test(k)).slice(0,15);
 for(const k of ['id','report_id'])resultado[k]=idMercadoPago(m[k]);
 for(const k of ['begin_date','end_date','generation_date','last_modified'])resultado[k]=typeof m[k]==='string'&&Number.isFinite(Date.parse(String(m[k])))?new Date(String(m[k])).toISOString():null;
 resultado.is_test=typeof m.is_test==='boolean'?m.is_test:null;
 resultado.avisos_tarea=Array.isArray(m.internal_management)?m.internal_management.map(v=>v&&typeof v==='object'&&typeof (v as Record<string,unknown>).notify==='boolean'?(v as Record<string,unknown>).notify:null):null;
 resultado.file_name=typeof m.file_name==='string'&&/^[-A-Za-z0-9_.]+\.csv$/i.test(m.file_name)?m.file_name:null;
 const lista=await reporteJSON(`${BASE}/list`);
 const filas=Array.isArray(lista)?lista:lista&&typeof lista==='object'&&Array.isArray((lista as {results?:unknown}).results)?(lista as {results:unknown[]}).results:[];
 resultado.lista_campos=lista&&typeof lista==='object'&&!Array.isArray(lista)?Object.keys(lista).slice(0,20):null;
 resultado.lista=filas.filter(v=>v&&typeof v==='object'&&idMercadoPago((v as Record<string,unknown>).id)===r.tarea_id).map(v=>{const f=v as Record<string,unknown>;return {id:idMercadoPago(f.id),status:typeof f.status==='string'?f.status.slice(0,100):null,file_name:typeof f.file_name==='string'?f.file_name.slice(0,150):null,report_id:idMercadoPago(f.report_id)};});
 if(typeof m.begin_date==='string'&&typeof m.end_date==='string'){
  const q=new URLSearchParams({begin_date:new Date(m.begin_date).toISOString().replace(/\.\d{3}Z$/,'Z'),end_date:new Date(m.end_date).toISOString().replace(/\.\d{3}Z$/,'Z'),format:'CSV',currency_id:'CLP',limit:'30'});
  const busqueda=await reporteJSON(`${BASE}/search?${q}`) as {results?:Record<string,unknown>[]};
  resultado.busqueda=(busqueda.results??[]).slice(0,5).map(f=>({titular_coincide:idMercadoPago(f.user_id)===r.collector_id,id:idMercadoPago(f.id),status:f.status,file_name:f.file_name,begin_date:f.begin_date,end_date:f.end_date,date_created:f.date_created}));
 }
 try{await reporteJSON(`/users/${r.collector_id}/mercadopago_account/balance`);resultado.consulta_directa='HTTP_200';}catch(e){resultado.consulta_directa=e instanceof ErrorMercadoPago?e.codigo:'NO_DISPONIBLE';}
 try{
  const principal=await reporteJSON(BASE);
  const objeto=principal&&typeof principal==='object'?principal as Record<string,unknown>:{};
  resultado.principal_campos=Array.isArray(principal)?['array']:Object.keys(objeto).slice(0,25);
  const entradas=Array.isArray(principal)?principal:Array.isArray(objeto.results)?objeto.results:[];
  resultado.principal=entradas.filter(v=>v&&typeof v==='object'&&idMercadoPago((v as Record<string,unknown>).id)===r.tarea_id).map(v=>{const f=v as Record<string,unknown>;return {id:idMercadoPago(f.id),status:f.status,file_name:f.file_name,report_id:idMercadoPago(f.report_id)};});
 }catch(e){resultado.principal_error=e instanceof ErrorMercadoPago?e.codigo:'NO_DISPONIBLE';}
 return resultado;
}
