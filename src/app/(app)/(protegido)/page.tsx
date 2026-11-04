import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { clp } from '@/lib/clp';
import { fechaLegible,hoyEnChile,inicioDelDia,finDelDia } from '@/lib/fechas';
import { leerTodas } from '@/lib/leer-todas';
const BOTONES=[
  {href:'/ventas',titulo:'Vender',icono:'🛒',clase:'bg-brand text-white'},
  {href:'/cobros',titulo:'Cobrar',icono:'💵',clase:'bg-emerald-800 text-white'},
  {href:'/entregas',titulo:'Entrega',icono:'📦',clase:'bg-sky-800 text-white'},
  {href:'/pacientes',titulo:'Paciente / receta',icono:'👁️',clase:'bg-tinta text-white'},
  {href:'/operativos',titulo:'Operativos',icono:'📍',clase:'bg-white text-tinta'},
  {href:'/caja',titulo:'Finanzas',icono:'💰',clase:'bg-white text-tinta'},
];
export default async function Dashboard(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect('/login');
  const {data:perfil}=await supabase.from('users').select('rol').eq('id',user.id).single();
  if(perfil?.rol==='ventas')redirect('/ventas');
  if(perfil?.rol==='clinico')redirect('/pacientes');
  if(perfil?.rol==='bodega')redirect('/ot');
  if(perfil?.rol!=='admin')redirect('/login');
  const hoy=hoyEnChile();
  const [ventas,proximo,pendientes]=await Promise.all([
    leerTodas((a,b)=>supabase.from('ventas').select('id,total').eq('anulada',false).gte('fecha',inicioDelDia(hoy)).lte('fecha',finDelDia(hoy)).order('id').range(a,b)),
    supabase.from('operativos').select('id,nombre,fecha').eq('estado','planificado').gte('fecha',hoy).order('fecha').limit(1).maybeSingle(),
    supabase.from('ordenes_trabajo').select('id',{count:'exact',head:true}).eq('estado','listo'),
  ]);
  return <div className="flex flex-col gap-5"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Inicio</h1><p className="text-sm">Ventas hoy <b className="text-emerald-800">{ventas.error?'No disponible':clp((ventas.data??[]).reduce((s,v)=>s+v.total,0))}</b></p></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{BOTONES.map(b=><Link key={b.href} href={b.href} className={`flex flex-col gap-2 rounded-2xl p-5 shadow-sm ${b.clase}`}><span aria-hidden className="text-2xl">{b.icono}</span><b>{b.titulo}</b></Link>)}</div>
    {(pendientes.count??0)>0&&<Link href="/entregas" className="rounded-2xl bg-sky-50 p-4 font-semibold text-sky-900">{pendientes.count} órdenes listas para entregar →</Link>}
    {pendientes.error&&<p role="alert" className="text-sm text-red-700">No se pudieron verificar las entregas.</p>}
    {proximo.data&&<Link href={`/operativos/${proximo.data.id}`} className="rounded-2xl bg-white p-4 shadow-sm"><span className="text-xs text-tinta-suave">Próximo operativo</span><b className="block">{proximo.data.nombre}</b><span className="text-sm">{fechaLegible(proximo.data.fecha)}</span></Link>}
  </div>;
}
