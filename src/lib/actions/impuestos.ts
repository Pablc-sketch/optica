'use server';
import {revalidatePath} from 'next/cache';
import {requerirPerfil,SinPermiso} from '@/lib/autorizacion';
import {hoyEnChile} from '@/lib/fechas';
import {fechaValidaDocumento} from '@/lib/fecha-documentos';
import {uuidAgenda} from '@/lib/agenda-terreno';
import {validarMesImpuesto,periodoValido,type MesImpuesto} from '@/lib/impuestos';
function refrescar(){for(const p of ['/impuestos','/gastos','/caja','/pagos','/reportes','/'])revalidatePath(p);}
export async function guardarImpuesto(m:MesImpuesto){
  try{
    const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
    const error=validarMesImpuesto(m,hoyEnChile());
    if(error||!Number.isSafeInteger(m.version)||m.version< -1)return {error:error??'Versión inválida. Recarga.'};
    const datos={tenant_id:tenantId,periodo:m.periodo,ventas_afectas:m.ventas_afectas,credito_fiscal:m.credito_fiscal,ppm:m.ppm,otros:m.otros,recargos:m.recargos,total_declarado:m.total_declarado,vence_el:m.vence_el,nota:m.nota};
    const r=await (m.version===-1?supabase.from('impuestos_mensuales').insert(datos):supabase.from('impuestos_mensuales').update(datos).eq('tenant_id',tenantId).eq('periodo',m.periodo).eq('version',m.version)).select('periodo').maybeSingle();
    if(r.error||!r.data)return {error:'No se guardó: el período pudo cambiar en otra sesión. Recarga antes de editar.'};
    refrescar();return {ok:true};
  }catch(e){if(e instanceof SinPermiso)return {error:e.message};throw e;}
}
export async function registrarPagoSii(p:{id:string;periodo:string;monto:number;fecha:string;caja:string;gastoId?:string}){
  try{
    const {supabase}=await requerirPerfil({roles:['admin'],suscripcion:true});
    if(!uuidAgenda.test(p.id)||!periodoValido(p.periodo)||!Number.isSafeInteger(p.monto)||p.monto<=0||p.monto>999999999999||!fechaValidaDocumento(p.fecha)||p.fecha>hoyEnChile()||!['digital','efectivo','personal'].includes(p.caja)||(p.gastoId&&!uuidAgenda.test(p.gastoId)))return {error:'Revisa el pago.'};
    const {error}=await supabase.rpc('registrar_pago_sii',{p_id:p.id,p_periodo:p.periodo,p_monto:p.monto,p_fecha:p.fecha,p_caja:p.caja,p_gasto_id:p.gastoId??null});
    if(error)return {error:error.code==='P0001'?error.message:'No se pudo confirmar. Recarga y revisa antes de reintentar.'};
    refrescar();return {ok:true};
  }catch(e){if(e instanceof SinPermiso)return {error:e.message};throw e;}
}
export async function desvincularPagoSii(id:string){
  const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
  if(!uuidAgenda.test(id))return {error:'Pago inválido.'};
  const {error}=await supabase.from('impuestos_pagos').update({anulado_en:new Date().toISOString()}).eq('id',id).eq('tenant_id',tenantId).is('anulado_en',null);
  if(error)return {error:'No se pudo desvincular. Recarga antes de reintentar.'};
  refrescar();return {ok:true};
}
