import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { consultarApiMP } from '@/lib/mercadopago-api';
import { esCobroIntegradoMP, idMercadoPago, normalizarPagoMercadoPago } from '@/lib/mercadopago-datos';
import { pagoConfirmadoDeOrden,referenciaPoint,type OrdenPoint } from '@/lib/mercadopago-point-datos';
export async function listarTerminalesMP(collector:string){
 const me=await consultarApiMP('/users/me');
 if(idMercadoPago(me.id)!==collector)throw new Error('CUENTA_NO_COINCIDE');
 const json=await consultarApiMP('/terminals/v1/list?limit=50&offset=0');
 const data=json.data as {terminals?:{id:unknown;operating_mode:unknown}[]}|undefined;
 if(!Array.isArray(data?.terminals))throw new Error('TERMINALES_NO_DISPONIBLES');
 return data.terminals.filter(t=>typeof t.id==='string'&&/^[A-Za-z0-9_-]{5,100}$/.test(t.id))
  .map(t=>({id:t.id as string,modo:String(t.operating_mode)}));
}
export async function verificarPagoMP(tenant:string,collector:string,pagoId:string,monto:number,medio?:string,soloExterno=false){
 if(!/^[0-9]{8,30}$/.test(pagoId))throw new Error('Usa el número completo de operación de Mercado Pago.');
 const raw=await consultarApiMP(`/v1/payments/${pagoId}`);
 if(soloExterno&&esCobroIntegradoMP(raw))throw new Error('Este cobro tiene orden integrada');
 const p=normalizarPagoMercadoPago(raw,collector);
 if(!p||p.pago_id!==pagoId||p.estado!=='approved'||p.monto_devuelto!==0||p.monto!==monto||!p.medio_pago||(medio&&p.medio_pago!==medio))
  throw new Error('La operación de Mercado Pago no coincide con el monto o medio de esta compra.');
 const {error}=await createAdminClient().from('mercadopago_pagos').upsert({...p,tenant_id:tenant,guardado_en:new Date().toISOString()},{onConflict:'tenant_id,pago_id'});
 if(error)throw new Error('No se pudo guardar la verificación del pago.');
 return p;
}
export async function refrescarOrdenPoint(c:OrdenPoint){
 if(!c.order_id)return {estado:'preparada',confirmado:false};
 const raw=await consultarApiMP(`/v1/orders/${c.order_id}`);
 const pago=pagoConfirmadoDeOrden(raw,c);
 const db=createAdminClient();
 if(pago){
  await verificarPagoMP(c.tenant_id,c.collector_id,pago,c.monto);
  const {data,error}=await db.rpc('mercadopago_aplicar_cobro',{p_tenant:c.tenant_id,p_id:c.id,p_pago:pago});
  if(error||!data)throw new Error('Pago recibido; falta asociarlo. No vuelvas a cobrar: revisa esta compra.');
  return {estado:'processed',confirmado:true,voucher:pago};
 }
 const estado=String(raw.status);
 if(!['created','at_terminal','action_required','failed','canceled','expired','refunded'].includes(estado))throw new Error('ESTADO_DESCONOCIDO');
 const {error}=await db.from('mercadopago_cobros').update({estado,actualizado_en:new Date().toISOString()}).eq('id',c.id).eq('tenant_id',c.tenant_id);
 if(error)throw new Error('No se pudo guardar el estado del cobro.');
 return {estado,confirmado:false};
}
export async function enviarOrdenPoint(c:OrdenPoint){
 if(c.order_id)return refrescarOrdenPoint(c);
 // La misma clave solo se reintenta dentro de una ventana corta. Nunca crear
 // otro cobro para recuperar una respuesta que se perdió en la red.
 if(Date.now()-Date.parse(c.creado_en)>10*60000)throw new Error('Intento sin respuesta: revisa la máquina y Mercado Pago antes de continuar.');
 const raw=await consultarApiMP('/v1/orders',{method:'POST',headers:{'X-Idempotency-Key':c.id},body:JSON.stringify({
  type:'point',external_reference:referenciaPoint(c.id),expiration_time:'PT5M',
  transactions:{payments:[{amount:String(c.monto)}]},config:{point:{terminal_id:c.terminal_id,print_on_terminal:'seller_ticket'}},
  description:'Cobro de compra Lentia',
 })});
 if(typeof raw.id!=='string'||!/^ORD[A-Za-z0-9]{5,80}$/.test(raw.id))throw new Error('Respuesta de cobro no confirmada. Reintenta este mismo intento.');
 const {error}=await createAdminClient().from('mercadopago_cobros').update({order_id:raw.id,estado:'created',actualizado_en:new Date().toISOString()}).eq('id',c.id).eq('tenant_id',c.tenant_id).is('order_id',null);
 if(error)throw new Error('Respuesta de máquina pendiente de guardar. Reintenta el mismo intento.');
 return refrescarOrdenPoint({...c,order_id:raw.id});
}
export async function sincronizarOrdenesPoint(tenant:string){
 const db=createAdminClient();
 const {data,error}=await db.from('mercadopago_cobros').select('*').eq('tenant_id',tenant).not('order_id','is',null)
  .in('estado',['created','at_terminal','action_required','revisar']).order('creado_en').limit(20);
 if(error)throw new Error('No se pudieron revisar los cobros Point.');
 let revisados=0;
 for(const c of data??[]){try{await refrescarOrdenPoint(c as OrdenPoint);revisados++;}catch{
  await db.from('mercadopago_cobros').update({error_codigo:'VERIFICACION_PENDIENTE',actualizado_en:new Date().toISOString()}).eq('id',c.id).eq('tenant_id',tenant);
 }}
 return {revisados};
}
