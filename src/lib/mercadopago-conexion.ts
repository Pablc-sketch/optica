import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {consultarSaldoMercadoPago} from '@/lib/mercadopago-saldo';
import {listarTerminalesMP} from '@/lib/mercadopago-point';
import {ErrorMercadoPago} from '@/lib/mercadopago-api';
export async function revisarConexionMP(tenant:string){
 if(!mercadoPagoConfigurado(tenant))return;
 const db=createAdminClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
 if(error||!data?.collector_id)return;
 const [saldo,terminales]=await Promise.allSettled([consultarSaldoMercadoPago(tenant,String(data.collector_id)),listarTerminalesMP(String(data.collector_id))]);
 const capacidades={consultado_en:new Date().toISOString(),saldo:saldo.status==='fulfilled'?saldo.value.estado:'error',
  point:terminales.status==='fulfilled'?terminales.value.length?terminales.value.some(t=>t.modo==='PDV')?'integrado':'requiere_pdv':'sin_terminal':terminales.reason instanceof ErrorMercadoPago?terminales.reason.codigo:'error',
  terminales:terminales.status==='fulfilled'?terminales.value.length:0};
 const {error:guardar}=await db.from('mercadopago_sync').update({capacidades}).eq('tenant_id',tenant);
 if(guardar)throw new Error('No se pudo guardar el estado de conexión.');
 return capacidades;
}
