import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirRolPagina } from '@/lib/autorizacion';
import { actualizarJornada } from '@/lib/actions/agenda-terreno';
import { fechaLegible,rangoHorario } from '@/lib/fechas';
import { clp } from '@/lib/clp';
import { leerTodas } from '@/lib/leer-todas';
import { gastosDeOperativo } from '@/lib/gastos-operativo';
import { costoPorChequeo } from '@/lib/agenda-terreno';
import FormularioAgenda from '@/components/formulario-agenda';

const gastos = { costo_transporte:'Bencina y transporte',costo_equipos:'Arriendo de equipos',costo_viaticos:'Viáticos',
  costo_arriendo:'Arriendo del lugar',costo_ayudante:'Personal',costo_otros:'Hospedaje y otros' } as const;
const btn='rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold';
export default async function OperativoTerreno({id}:{id:string}) {
  const {supabase,tenantId}=await exigirRolPagina(['admin']);
  const [r,personas]=await Promise.all([
    supabase.from('operativos').select('id,nombre,direccion,fecha,fecha_fin,hora_inicio,hora_fin,estado,meta_examenes,costo_transporte,costo_equipos,costo_viaticos,costo_arriendo,costo_ayudante,costo_otros').eq('id',id).eq('tenant_id',tenantId).maybeSingle(),
    leerTodas((a,b)=>supabase.from('recetas').select('id,paciente_id').eq('operativo_id',id).eq('tenant_id',tenantId).order('id').range(a,b)),
  ]);
  if (r.error || personas.error) throw new Error('No pudimos cargar el operativo');
  if (!r.data) notFound();
  const o=r.data,n=new Set((personas.data ?? []).map(p=>p.paciente_id).filter(Boolean)).size;
  const total=gastosDeOperativo(o), unitario=costoPorChequeo(total,n);
  return <div className="mx-auto max-w-3xl space-y-4">
    <Link href={'/agenda/equipos?mes='+o.fecha.slice(0,7)+'&dia='+o.fecha} className="text-sm underline">← Agenda de equipos</Link>
    <div><h1 className="text-2xl font-bold">{o.nombre}</h1><p className="text-sm text-tinta-suave">{fechaLegible(o.fecha)} · {rangoHorario(o.hora_inicio,o.hora_fin) || 'Sin horario'} · <span className="capitalize">{o.estado}</span></p><p className="text-sm">{o.direccion}</p></div>
    <div className="flex flex-wrap gap-2">
      {o.estado!=='cancelado' && <Link className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white" href={'/ventas?op='+id}>Vender en este operativo</Link>}
      <Link className={btn} href={'/cobros?op='+id}>Cobros y entregas</Link>
      {o.estado==='planificado' && <Link className={btn} href={'/agenda/equipos/turno?id='+id}>Editar equipo y horario</Link>}
    </div>
    <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <div><dt className="text-xs">Atendidos</dt><dd className="text-lg font-bold">{n}</dd></div>
      <div><dt className="text-xs">Gasto total</dt><dd className="text-lg font-bold">{clp(total)}</dd></div>
      <div><dt className="text-xs">Costo por chequeo</dt><dd className="text-lg font-bold">{unitario===null ? '—' : clp(unitario)}</dd></div>
    </dl>
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-bold">Gastos registrados</h2>
      <FormularioAgenda accion={actualizarJornada} etiqueta="Guardar gastos">
        <input name="id" type="hidden" value={id}/>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(gastos).map(([k,label])=><label key={k} className="min-w-0 text-sm font-medium">{label}
            <input name={k} type="number" min={0} max={999999999} step={1} defaultValue={o[k as keyof typeof gastos] ?? 0} className="w-full rounded-xl border px-3 py-2.5"/>
          </label>)}
        </div>
      </FormularioAgenda>
    </section>
    <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Cambiar estado</summary>
      <div className="mt-3"><FormularioAgenda accion={actualizarJornada} etiqueta="Guardar estado">
        <input name="id" type="hidden" value={id}/>
        <label className="block text-sm">Estado<select name="estado" defaultValue={o.estado} className="ml-2 rounded-xl border p-2">
          <option value="planificado">Planificado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option>
        </select></label>
      </FormularioAgenda></div>
    </details>
  </div>;
}
