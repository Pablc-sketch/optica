import 'server-only';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {createAdminClient} from '@/lib/supabase/admin';
import {verificarPagoMP} from '@/lib/mercadopago-point';
export async function verificarVoucherConProveedor(tenant:string,medio:string,monto:number,voucher:string|null):Promise<string|null>{
 if(!monto||!['debito','credito'].includes(medio)||!mercadoPagoConfigurado(tenant))return null;
 try{
  const {data,error}=await createAdminClient().from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
  if(error||!data?.collector_id)return 'No se pudo verificar la cuenta de Mercado Pago. El cobro no se registró.';
  await verificarPagoMP(tenant,String(data.collector_id),voucher??'',monto,medio,true);
  return null;
 }catch{return 'Mercado Pago no pudo verificar el cobro seleccionado. Revisa el monto y el medio en la app de Mercado Pago. No vuelvas a cobrar.';}
}
