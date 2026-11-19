'use server';
import { requerirPerfil } from '@/lib/autorizacion';
import { createAdminClient } from '@/lib/supabase/admin';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import { listarTerminalesMP,enviarOrdenPoint,refrescarOrdenPoint } from '@/lib/mercadopago-point';
import type { OrdenPoint } from '@/lib/mercadopago-point-datos';
import { revalidarOperacionVenta } from '@/lib/revalidar-venta';
import { revalidatePath } from 'next/cache';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
async function contexto(){
 const ctx=await requerirPerfil({roles:['admin','ventas'],suscripcion:true});
 if(!mercadoPagoConfigurado(ctx.tenantId))throw new Error('Point no está conectado para esta óptica.');
 const db=createAdminClient();
 const {data,error}=await db.from('mercadopago_sync').select('collector_id').eq('tenant_id',ctx.tenantId).single();
 if(error||!data?.collector_id)throw new Error('Falta verificar la cuenta de Mercado Pago.');
 return {...ctx,db,collector:String(data.collector_id)};
}
function mensaje(e:unknown){
 const texto=e instanceof Error?e.message:'';
 return /^(Pago recibido|Intento sin respuesta|Respuesta de|No se pudo guardar|Falta verificar|Point no está|Compra no disponible|El monto supera|El intento ya|Cuenta no verificada)/.test(texto)?texto:'No se pudo confirmar el cobro. Revisa Mercado Pago y reintenta el mismo intento; no cobres otra vez en la máquina.';
}
export async function prepararPoint(ventaId:string){
 try{
  if(!uuid.test(ventaId))throw new Error('Compra no disponible');
  const c=await contexto();
  const {data:v,error}=await c.supabase.from('ventas').select('id').eq('id',ventaId).eq('tenant_id',c.tenantId).eq('anulada',false).maybeSingle();
  if(error||!v)throw new Error('Compra no disponible');
  const [terminales,previo]=await Promise.all([listarTerminalesMP(c.collector),c.db.from('mercadopago_cobros').select('*').eq('tenant_id',c.tenantId).eq('venta_id',ventaId).in('estado',['preparada','created','at_terminal','action_required','revisar']).order('creado_en',{ascending:false}).limit(1).maybeSingle()]);
  if(previo.error)throw new Error('No se pudo revisar el intento anterior');
  return {ok:true as const,terminales,previo:previo.data as OrdenPoint|null};
 }catch(e){return {ok:false as const,error:mensaje(e)};}
}
export async function cobrarConPoint(input:{ventaId:string;intentoId:string;monto:number;terminalId:string}){
 try{
  if(!uuid.test(input.ventaId)||!uuid.test(input.intentoId)||!Number.isSafeInteger(input.monto)||input.monto<=0||!/^[A-Za-z0-9_-]{5,100}$/.test(input.terminalId))throw new Error('Compra no disponible: revisa los datos.');
  const c=await contexto();
  const terminales=await listarTerminalesMP(c.collector);
  if(!terminales.some(t=>t.id===input.terminalId&&t.modo==='PDV'))return {ok:false as const,error:'La máquina debe estar en modo integrado PDV. Configúrala en Mercado Pago antes de cobrar.'};
  const {data,error}=await c.db.rpc('mercadopago_preparar_cobro',{p_tenant:c.tenantId,p_actor:c.user.id,p_id:input.intentoId,p_venta:input.ventaId,p_monto:input.monto,p_terminal:input.terminalId,p_collector:c.collector});
  if(error||!data)return {ok:false as const,error:error?.code==='23505'?'Ya hay un cobro pendiente para esta compra. Abre el intento existente.':'No se pudo preparar el cobro. Revisa el saldo y el intento pendiente.'};
  const r=await enviarOrdenPoint(data as OrdenPoint);
  revalidarOperacionVenta();revalidatePath('/caja');
  return {ok:true as const,...r,intentoId:input.intentoId};
 }catch(e){return {ok:false as const,error:mensaje(e)};}
}
export async function consultarPoint(intentoId:string){
 try{
  if(!uuid.test(intentoId))throw new Error('Compra no disponible');
  const c=await contexto();
  const {data,error}=await c.db.from('mercadopago_cobros').select('*').eq('tenant_id',c.tenantId).eq('id',intentoId).single();
  if(error||!data)throw new Error('Compra no disponible');
  const r=await refrescarOrdenPoint(data as OrdenPoint);
  if(r.confirmado){revalidarOperacionVenta();revalidatePath('/caja');}
  return {ok:true as const,...r};
 }catch(e){return {ok:false as const,error:mensaje(e)};}
}
