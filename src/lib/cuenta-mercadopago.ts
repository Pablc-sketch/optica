import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {consultarSaldoMercadoPago,type SaldoMercadoPago} from '@/lib/mercadopago-saldo';
export type EstadoCuenta={saldo:SaldoMercadoPago;ultimaCorrecta:string|null;estado:string;errorCodigo:string|null;point?:string;reporteEstado?:string;reporteError?:string|null};
export async function leerEstadoCuenta(tenantId:string):Promise<EstadoCuenta>{
 if(!mercadoPagoConfigurado(tenantId))return {saldo:{estado:'no_configurado'},ultimaCorrecta:null,estado:'no_configurado',errorCodigo:null};
 const db=await createClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id,ultima_correcta,estado,error_codigo,capacidades').eq('tenant_id',tenantId).maybeSingle();
 let saldo:SaldoMercadoPago=error?{estado:'error' as const}:await consultarSaldoMercadoPago(tenantId,data?.collector_id??null);
 const {data:reporte,error:errorReporte}=await db.from('mercadopago_saldos').select('estado,saldo_disponible,saldo_al,verificado_en,error_codigo,collector_id').eq('tenant_id',tenantId).maybeSingle();
 if(!errorReporte&&saldo.estado!=='disponible'&&reporte?.saldo_disponible!==null&&reporte?.saldo_disponible!==undefined&&reporte.saldo_al&&reporte.verificado_en&&reporte.collector_id===data?.collector_id){
  const importe=Number(reporte.saldo_disponible);const corte=Date.parse(reporte.saldo_al);
  const reportesPausados=reporte.error_codigo==='AVISO_REPORTE_NO_DESACTIVADO';
  if(Number.isFinite(importe)&&Number.isFinite(corte)&&corte<=Date.now())saldo={estado:'reporte',disponible:importe,hasta:reporte.saldo_al,consultadoEn:reporte.verificado_en,vigente:!reportesPausados&&Date.now()-corte<20*60000,reportesPausados};
 }
 return {saldo,reporteEstado:reporte?.estado,reporteError:reporte?.error_codigo,ultimaCorrecta:data?.ultima_correcta??null,estado:data?.estado??'pendiente',errorCodigo:data?.error_codigo??null,point:data?.capacidades?.point};
}
