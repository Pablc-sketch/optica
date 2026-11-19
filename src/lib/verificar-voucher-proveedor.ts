import 'server-only';
import {mercadoPagoConfigurado} from '@/lib/mercadopago-sync';
import {createAdminClient} from '@/lib/supabase/admin';
import {verificarPagoMP} from '@/lib/mercadopago-point';
export async function verificarVoucherConProveedor(tenant:string,medio:string,monto:number,voucher:string|null):Promise<string|null>{
 if(!monto||!['debito','credito'].includes(medio)||!mercadoPagoConfigurado(tenant))return null;
 try{
  const {data,error}=await createAdminClient().from('mercadopago_sync').select('collector_id').eq('tenant_id',tenant).single();
  if(error||!data?.collector_id)return 'No se pudo verificar la cuenta de Mercado Pago. El cobro no se registró.';
  await verificarPagoMP(tenant,String(data.collector_id),voucher??'',monto,medio);
  return null;
 }catch{return 'Mercado Pago no confirma este voucher, monto y medio de pago. Revisa la operación original; no vuelvas a cobrar.';}
}
