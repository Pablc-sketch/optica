import type {createClient} from './supabase/server';
import {esPilotoTerreno} from './piloto-terreno';
type Supabase=Awaited<ReturnType<typeof createClient>>;
export async function configuracionModelo(supabase:Supabase){
 const {data,error}=await supabase.from('tenants').select('id,modelo_operacion,precio_consulta').single();
 if(error||!data)throw new Error('No se pudo cargar la configuración de la óptica.');
 return {comercial:data.modelo_operacion==='comercial',precioConsulta:data.modelo_operacion==='comercial'?data.precio_consulta as number|null:5000};
}
export async function usaGestionGeneral(supabase:Supabase,tenantId:string|null|undefined){return esPilotoTerreno(tenantId)||(await configuracionModelo(supabase)).comercial;}
