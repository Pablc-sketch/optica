import Link from 'next/link';
import {notFound} from 'next/navigation';
import {exigirRolPagina} from '@/lib/autorizacion';
import {usaGestionGeneral} from '@/lib/modelo-optica';
import {guardarEquipoFisico,guardarKit} from '@/lib/actions/agenda-terreno';
import {leerTodas} from '@/lib/leer-todas';
import FormularioAgenda from '@/components/formulario-agenda';
const campo='w-full rounded-xl border bg-white px-3 py-2.5 text-base';
const TIPOS={autorefractometro:'Autorefractómetro',lensometro:'Lensómetro',maleta:'Maleta de lentes',otro:'Otro equipo'};
export default async function Kits(){
 const {supabase,tenantId}=await exigirRolPagina(['admin']);if(!(await usaGestionGeneral(supabase,tenantId)))notFound();
 const [eq,kits,comp]=await Promise.all([
  leerTodas((a,b)=>supabase.from('equipos_fisicos').select('id,nombre,tipo,identificador,estado').eq('tenant_id',tenantId).order('nombre').order('id').range(a,b)),
  leerTodas((a,b)=>supabase.from('agenda_recursos').select('id,nombre').eq('tenant_id',tenantId).eq('tipo','kit').order('nombre').order('id').range(a,b)),
  leerTodas((a,b)=>supabase.from('kit_componentes').select('kit_id,equipo_id').eq('tenant_id',tenantId).order('kit_id').order('equipo_id').range(a,b)),
 ]);if(eq.error||kits.error||comp.error)throw new Error('No se pudieron cargar equipos y kits.');
 const equipos=eq.data??[],componentes=comp.data??[];type Equipo=(typeof equipos)[number];
 const equipoForm=(e?:Equipo)=><FormularioAgenda accion={guardarEquipoFisico} etiqueta="Guardar equipo"><input type="hidden" name="id" value={e?.id??''}/><div className="grid gap-3 sm:grid-cols-2">
  <label className="text-sm">Nombre<input name="nombre" required maxLength={100} defaultValue={e?.nombre??''} className={campo}/></label>
  <label className="text-sm">Tipo<select name="tipo" defaultValue={e?.tipo??'autorefractometro'} className={campo}>{Object.entries(TIPOS).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label>
  <label className="text-sm">Número de serie o código interno<input name="identificador" required maxLength={100} defaultValue={e?.identificador??''} className={campo}/></label>
  <label className="text-sm">Estado<select name="estado" defaultValue={e?.estado??'disponible'} className={campo}><option value="disponible">Disponible</option><option value="mantenimiento">En mantenimiento</option><option value="inactivo">Inactivo</option></select></label>
 </div></FormularioAgenda>;
 const kitForm=(k?:{id:string;nombre:string})=><FormularioAgenda accion={guardarKit} etiqueta="Guardar kit"><input type="hidden" name="id" value={k?.id??''}/><label className="text-sm">Nombre del kit<input name="nombre" maxLength={100} required defaultValue={k?.nombre??''} className={campo}/></label>
  <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Componentes del inventario</legend>{equipos.map(e=>{const asignado=componentes.find(c=>c.equipo_id===e.id),propio=asignado?.kit_id===k?.id;return <label key={e.id} className="flex items-start gap-2 rounded-xl border p-3 text-sm"><input type="checkbox" name="equipos" value={e.id} defaultChecked={propio} disabled={(!propio&&!!asignado)||e.estado!=='disponible'} className="mt-1"/><span className="min-w-0 break-words"><b>{e.nombre}</b> · {e.identificador}<span className="block text-xs text-tinta-suave">{TIPOS[e.tipo as keyof typeof TIPOS]}{asignado&&!propio?' · En otro kit':''}{e.estado!=='disponible'?' · Fuera de servicio':''}</span></span></label>})}</fieldset>
  <p className="text-xs text-tinta-suave">Incluye autorefractómetro, lensómetro y maleta. Para cambiar un kit reservado, reasigna sus operativos.</p>
 </FormularioAgenda>;
 return <div className="space-y-5"><Link href="/agenda/equipos" className="text-sm underline">← Calendario</Link><h1 className="text-2xl font-bold">Inventario de equipos y kits</h1>
  <section className="space-y-3"><h2 className="font-bold">Equipos físicos · {equipos.length}</h2><details className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">＋ Agregar equipo</summary><div className="mt-3">{equipoForm()}</div></details>{equipos.map(e=><details key={e.id} className="rounded-xl bg-white p-4"><summary className="cursor-pointer">{e.nombre} · {e.identificador} · {e.estado}</summary><div className="mt-3">{equipoForm(e)}</div></details>)}</section>
  <section className="space-y-3"><h2 className="font-bold">Kits · {kits.data?.length??0}</h2>{equipos.length>0?<details className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">＋ Armar kit</summary><div className="mt-3">{kitForm()}</div></details>:<p className="rounded-xl bg-white p-4 text-sm">Agrega los equipos físicos para armar tu primer kit.</p>}{(kits.data??[]).map(k=><details key={k.id} className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">{k.nombre} · {componentes.filter(c=>c.kit_id===k.id).length} componentes</summary><div className="mt-3">{kitForm(k)}</div></details>)}</section>
 </div>;
}
