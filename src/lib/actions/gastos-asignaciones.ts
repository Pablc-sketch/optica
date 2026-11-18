'use server';
import { revalidatePath } from 'next/cache';
import { requerirPerfil, SinPermiso } from '@/lib/autorizacion';
import { COSTOS } from '@/lib/pagos-operativo';
import { uuidAgenda } from '@/lib/agenda-terreno';
function refrescar() {
  for (const p of ['/gastos','/caja','/pagos','/pagos/revisar','/reportes','/']) revalidatePath(p);
  revalidatePath('/operativos/[id]/cierre','page');
}
export async function vincularGasto(input:{id:string;gastoId:string;operativoId:string;clave:string;monto:number}) {
  try {
    const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
    if (![input.id,input.gastoId,input.operativoId].every(id=>uuidAgenda.test(id)) || !Number.isSafeInteger(input.monto) || input.monto<=0
      || !['fides','marcos',...COSTOS.map(c=>c.clave)].includes(input.clave)) return {error:'Revisa el gasto y el monto a vincular.'};
    const {error}=await supabase.from('gastos_asignaciones').insert({id:input.id,tenant_id:tenantId,gasto_id:input.gastoId,operativo_id:input.operativoId,clave:input.clave,monto:input.monto});
    if (error && error.code!=='23505') return {error:error.code==='P0001'?error.message:'No se pudo vincular. Recarga y revisa antes de reintentar.'};
    refrescar(); return {ok:true};
  } catch(e) { if(e instanceof SinPermiso) return {error:e.message}; throw e; }
}
export async function deshacerVinculo(id:string) {
  const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
  if(!uuidAgenda.test(id)) return {error:'Vinculación inválida.'};
  const {error}=await supabase.from('gastos_asignaciones').update({anulado_en:new Date().toISOString()}).eq('id',id).eq('tenant_id',tenantId).is('anulado_en',null);
  if(error) return {error:'No se pudo deshacer. Recarga antes de reintentar.'};
  refrescar();return {ok:true};
}
