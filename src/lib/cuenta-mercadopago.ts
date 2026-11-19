import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {consultarSaldoMercadoPago,type SaldoMercadoPago} from '@/lib/mercadopago-saldo';
export type EstadoCuenta={saldo:SaldoMercadoPago;ultimaCorrecta:string|null;estado:string;errorCodigo:string|null;point?:string};
export async function leerEstadoCuenta(tenantId:string):Promise<EstadoCuenta>{
 if(!mercadoPagoConfigurado(tenantId))return {saldo:{estado:'no_configurado'},ultimaCorrecta:null,estado:'no_configurado',errorCodigo:null};
 const db=await createClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id,ultima_correcta,estado,error_codigo,capacidades').eq('tenant_id',tenantId).maybeSingle();
 const saldo=error?{estado:'error' as const}:await consultarSaldoMercadoPago(tenantId,data?.collector_id??null);
 return {saldo,ultimaCorrecta:data?.ultima_correcta??null,estado:data?.estado??'pendiente',errorCodigo:data?.error_codigo??null,point:data?.capacidades?.point};
}
