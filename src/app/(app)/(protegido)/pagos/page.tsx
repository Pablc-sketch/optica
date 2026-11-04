import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { cargarPendientes } from '@/lib/resumen-pendientes';
import { clp } from '@/lib/clp';
import { fechaLegible } from '@/lib/fechas';
import FinanzasNav from '@/components/finanzas-nav';

const VISTAS = [{ clave:'sueldos',titulo:'Equipo' },{ clave:'costos',titulo:'Proveedores y costos' },{ clave:'ahorro',titulo:'Ahorro' }] as const;
export default async function Pagos({ searchParams }: { searchParams:Promise<{ ver?:string }> }) {
  const { supabase } = await exigirRolPagina(['admin']);
  const { ver } = await searchParams;
  const vista = VISTAS.find(v=>v.clave===ver)??VISTAS[0];
  const { resumen,error,sinAsignar } = await cargarPendientes(supabase);
  const filas = resumen.operativos.filter(o=>o[vista.clave]>0);
  return <div className="flex flex-col gap-5"><FinanzasNav activo="pendientes" />
    <div className="flex flex-wrap gap-2" aria-label="Tipo de pendiente">{VISTAS.map(v=><Link key={v.clave} href={`/pagos?ver=${v.clave}`} aria-current={vista.clave===v.clave?'page':undefined} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${vista.clave===v.clave?'border-teal-800 bg-teal-800 text-white':'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{v.titulo}</Link>)}</div>
    {error?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">No se pudieron leer todos los pendientes. Recarga antes de registrar pagos.</p>:<>
      {sinAsignar && <Link href="/pagos/revisar?operativo=sin" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Hay retiros o aportes sin operativo asignado. Revísalos antes de pagar para evitar duplicaciones →</Link>}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-600">{vista.titulo} · pendiente calculado</p><p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{clp(resumen[vista.clave])}</p><p className="mt-2 text-xs text-slate-500">Elige el operativo y registra solamente lo que ya pagaste. Un pendiente no descuenta dinero de la caja.</p>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">{(vista.clave==='sueldos'?[['Pablo',resumen.personas.pablo],['Pamela',resumen.personas.madre],['Isadora',resumen.personas.isadora]]:vista.clave==='costos'?[['Fides',resumen.fides],['Marcos',resumen.marcos],['Costos del operativo',resumen.gastos]]:[['Ahorro por separar',resumen.ahorro]]).map(([n,v])=><div key={n}><dt className="text-xs text-slate-500">{n}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{clp(Number(v))}</dd></div>)}</dl>
      </section>
      <section><h2 className="mb-3 text-sm font-semibold text-slate-600">Por operativo · del más antiguo al más reciente</h2>
        {filas.length===0?<div className="rounded-2xl border border-teal-200 bg-teal-50 p-6"><h3 className="font-semibold text-teal-950">Sin pendientes calculados</h3><p className="mt-1 text-sm text-teal-900">Puedes comprobar los pagos en Movimientos.</p></div>:<ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{filas.map(o=><li key={o.operativoId} className="border-b border-slate-100 last:border-0"><Link href={`/operativos/${o.operativoId}/cierre#${vista.clave}`} className="flex items-center justify-between gap-4 p-5 hover:bg-slate-50"><span className="min-w-0"><b className="block break-words text-sm text-slate-900">{o.nombre}</b><span className="mt-1 block text-xs text-slate-500">{fechaLegible(o.fecha)}</span></span><span className="shrink-0 text-right"><b className="block tabular-nums text-slate-950">{clp(o[vista.clave])}</b><span className="mt-1 block text-xs font-semibold text-teal-900">Ver detalle y registrar →</span></span></Link></li>)}</ul>}
      </section>
    </>}
  </div>;
}
