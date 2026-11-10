import type {createClient} from './supabase/server';
export async function profesionalesParaReceta(supabase:Awaited<ReturnType<typeof createClient>>){
 const {data:{user}}=await supabase.auth.getUser();if(!user)return [];
 const {data:perfil,error}=await supabase.from('users').select('tenant_id,rol').eq('id',user.id).single();if(error||!perfil)throw new Error('No se pudo cargar el perfil.');
 let q=supabase.from('agenda_recursos').select('id,nombre,rut').eq('tenant_id',perfil.tenant_id).eq('tipo','tecnologo').eq('activo',true).order('nombre');
 if(perfil.rol!=='admin')q=q.eq('usuario_id',user.id);
 const r=await q;if(r.error)throw new Error('No se pudieron cargar los tecnólogos.');return r.data??[];
}
