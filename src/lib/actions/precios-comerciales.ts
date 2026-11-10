'use server';
import {revalidatePath} from 'next/cache';
import {requerirPerfil,SinPermiso} from '@/lib/autorizacion';
import {configuracionModelo} from '@/lib/modelo-optica';
import {costoParPropio,montoComercial} from '@/lib/precios-comerciales';
import {limitesDeRango} from '@/lib/cristales';
import {uuidAgenda} from '@/lib/agenda-terreno';
import type {ResultadoAgenda} from './agenda-terreno';
export async function guardarPrecioPropio(f:FormData):Promise<ResultadoAgenda>{
 try{
  const {supabase,tenantId}=await requerirPerfil({roles:['admin'],suscripcion:true});
  if(!(await configuracionModelo(supabase)).comercial)return {error:'Esta configuración pertenece a la edición comercial.'};
  const tipo=String(f.get('tipo')??''),id=String(f.get('id')??'');
  if(id&&!uuidAgenda.test(id))return {error:'Registro inválido.'};
  if(tipo==='consulta'){
   const {error}=await supabase.from('tenants').update({precio_consulta:montoComercial(f.get('precio'))}).eq('id',tenantId);if(error)throw new Error('No se pudo guardar el precio.');
  }else if(tipo==='producto'){
   if(!id)return {error:'Selecciona un producto del inventario.'};
   const {data,error}=await supabase.from('productos').update({costo:montoComercial(f.get('costo')),precio_venta:montoComercial(f.get('precio'))}).eq('id',id).eq('tenant_id',tenantId).select('id').maybeSingle();if(error||!data)throw new Error('No se pudo guardar el producto.');
  }else if(tipo==='cristal'){
   const leer=(k:string)=>String(f.get(k)??'').trim();
   const tipoLente=leer('tipo_lente'),rango=leer('rango_receta'),tratamiento=leer('tratamiento'),proveedor=leer('proveedor_id'),unidad=leer('unidad');
   if(!['Monofocal','Bifocal','Multifocal'].includes(tipoLente)||!limitesDeRango(rango)||!tratamiento||tratamiento.length>120||!uuidAgenda.test(proveedor))return {error:'Completa tipo, rango (±esfera / ±cilindro), tratamiento y laboratorio.'};
   if(!['unidad','par'].includes(unidad))return {error:'Indica si la tarifa es por unidad o par.'};
   const tarifa=montoComercial(f.get('tarifa'))!,montaje=montoComercial(f.get('montaje'))!,impuesto=leer('iva_pct');
   if(!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(impuesto))return {error:'Indica el impuesto a agregar; usa 0 si la tarifa ya lo incluye.'};
   const iva=Number(impuesto.replace(',','.'));
   const valores={tipo_lente:tipoLente,rango_receta:rango,tratamiento,proveedor_id:proveedor,costo:costoParPropio(tarifa,unidad as 'unidad'|'par',montaje,iva),precio_venta:montoComercial(f.get('precio')),catalogo_propio:true,nombre_laboratorio:leer('nombre_laboratorio')||tratamiento,tarifa_config:{tarifa,unidad,montaje,iva_pct:iva},precio_venta_stock:null,costo_stock:null};
   const {data,error}=await(id?supabase.from('costos_cristales').update(valores).eq('id',id).eq('tenant_id',tenantId):supabase.from('costos_cristales').insert({...valores,tenant_id:tenantId})).select('id').maybeSingle();
   if(error||!data)return {error:error?.code==='23505'?'Ya existe ese tipo, rango y tratamiento. Edita la tarifa existente.':'No se pudo guardar el cristal. Revisa laboratorio y montos.'};
  }else return {error:'Tipo de precio inválido.'};
  revalidatePath('/precios');revalidatePath('/ventas');revalidatePath('/cobros');revalidatePath('/pacientes','layout');return {mensaje:'Precio guardado. Las ventas anteriores conservan sus importes.'};
 }catch(e){if(e instanceof SinPermiso||e instanceof Error)return {error:e.message};throw e;}
}
