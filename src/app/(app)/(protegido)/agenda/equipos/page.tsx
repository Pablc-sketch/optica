import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { notFound } from "next/navigation";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { costoPorChequeo, mesAgenda, ROLES_AGENDA, totalPresupuesto, uuidAgenda, type Presupuesto, type RecursoAgenda } from '@/lib/agenda-terreno';
import { fechaConDia, fechaLegible, hoyEnChile, mesDesplazado, nombreMes, primerDiaDelMes, ultimoDiaDelMes, semanasDelMes } from '@/lib/fechas';
import { clp } from '@/lib/clp';
import { gastosDeOperativo } from '@/lib/gastos-operativo';
import { leerTodas } from '@/lib/leer-todas';
import CabeceraPagina from '@/components/cabecera-pagina';

const ruta = '/agenda/equipos';
const dias = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
type Turno = { vendedora_id: string; tecnologo_id: string; coordinador_id: string; kit_id: string; presupuesto: Presupuesto };
export default async function AgendaEquipos({ searchParams }: { searchParams: Promise<{mes?: string; dia?: string; recurso?: string}> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  if (!esPilotoTerreno(tenantId)) notFound();
  const p = await searchParams, mes = mesAgenda(p.mes);
  const primero = primerDiaDelMes(mes), ultimo = ultimoDiaDelMes(mes), hoy = hoyEnChile();
  const semanas = semanasDelMes(mes);
  const dia = semanas.flat().find(d => d === p.dia) ?? '';
  const recurso = uuidAgenda.test(p.recurso ?? '') ? p.recurso! : '';
  const [operativos, recursos] = await Promise.all([
    leerTodas((a,b) => supabase.from('operativos')
      .select('id,nombre,direccion,fecha,fecha_fin,hora_inicio,hora_fin,estado,meta_examenes,costo_transporte,costo_arriendo,costo_viaticos,costo_otros,costo_ayudante,costo_equipos,agenda_turnos(vendedora_id,tecnologo_id,coordinador_id,kit_id,presupuesto)')
      .eq('tenant_id',tenantId).lte('fecha',ultimo).or('fecha.gte.'+primero+',fecha_fin.gte.'+primero)
      .order('fecha').order('hora_inicio').order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('agenda_recursos').select('id,tipo,nombre,detalle').eq('tenant_id',tenantId).order('nombre').order('id').range(a,b)),
  ]);
  if (operativos.error || recursos.error) throw new Error('No pudimos cargar la agenda');
  const equipo = (recursos.data ?? []) as RecursoAgenda[];
  const catalogo = new Map(equipo.map(r => [r.id,r]));
  const actividades = (operativos.data ?? []).map(o => {
    const rel = o.agenda_turnos as unknown as Turno | Turno[] | null;
    const turno = (Array.isArray(rel) ? rel[0] : rel) ?? null;
    const personas = turno ? [turno.vendedora_id,turno.tecnologo_id,turno.coordinador_id,turno.kit_id] : [];
    return {...o,turno,personas};
  }).filter(o => !recurso || o.personas.includes(recurso));
  const visibles = dia ? actividades.filter(o => o.fecha <= dia && (o.fecha_fin ?? o.fecha) >= dia) : actividades;
  const realizados = visibles.filter(o => o.estado !== 'cancelado').map(o=>o.id);
  const consultas = await Promise.all(Array.from({length:Math.ceil(realizados.length/100)},(_,i) =>
    leerTodas((a,b) => supabase.from('recetas').select('id,operativo_id,paciente_id').eq('tenant_id',tenantId)
      .in('operativo_id',realizados.slice(i*100,i*100+100)).order('id').range(a,b))));
  if (consultas.some(r=>r.error)) throw new Error('No pudimos contar los chequeos');
  const atendidos = new Map<string,Set<string>>();
  for (const res of consultas) for (const r of res.data ?? []) {
    if (!r.operativo_id || !r.paciente_id) continue;
    const grupo = atendidos.get(r.operativo_id) ?? new Set<string>();
    grupo.add(r.paciente_id); atendidos.set(r.operativo_id,grupo);
  }
  const url = (m: string,d = '') => ruta + '?' + new URLSearchParams({mes:m,...(d ? {dia:d} : {}),...(recurso ? {recurso} : {})});
  const btn = 'rounded-xl border border-tinta/15 bg-white px-3 py-2 text-sm font-semibold';
  return <div className="space-y-5">
    <CabeceraPagina seccion="En terreno" titulo="Agenda de equipos" acciones={
      <>
        <Link href={ruta+'/recursos'} className={btn}>Personal y kits</Link>
        <Link href={ruta+'/turno?dia='+(dia || (hoy.startsWith(mes) ? hoy : primero))} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">＋ Agendar operativo</Link>
      </>
    } />
    <section aria-label="Calendario mensual" className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={url(mesDesplazado(mes,-1))} aria-label="Mes anterior" className={btn}>←</Link>
          <h2 className="text-base font-bold first-letter:uppercase sm:text-lg">{nombreMes(mes)}</h2>
          <Link href={url(mesDesplazado(mes,1))} aria-label="Mes siguiente" className={btn}>→</Link>
          <Link href={url(hoy.slice(0,7),hoy)} className={btn}>Hoy</Link>
        </div>
        <form action={ruta} className="flex flex-wrap gap-2">
          <input name="mes" type="hidden" value={mes} />
          {dia && <input name="dia" type="hidden" value={dia} />}
          <select aria-label="Filtrar por persona o kit" name="recurso" defaultValue={recurso} className="max-w-52 rounded-xl border px-2 py-2 text-sm">
            <option value="">Todo el equipo</option>
            {Object.entries(ROLES_AGENDA).map(([tipo,label])=><optgroup key={tipo} label={label}>
              {equipo.filter(r=>r.tipo===tipo).map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}
            </optgroup>)}
          </select>
          <button className={btn}>Filtrar</button>
        </form>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {dias.map(d=><span key={d} className="py-1 text-xs font-semibold text-tinta-suave">{d}</span>)}
        {semanas.flat().map((d,i)=>{
          if (!d) return <div key={'vacío'+i} className="rounded-lg bg-crema/50" />;
          const lista = actividades.filter(o=>o.fecha<=d && (o.fecha_fin ?? o.fecha)>=d && o.estado!=='cancelado');
          return <Link key={d} href={url(mes,d===dia ? '' : d)} aria-current={dia===d ? 'date' : undefined}
            aria-label={fechaLegible(d)+': '+lista.length+(lista.length===1 ? ' operativo' : ' operativos')}
            className={`min-h-12 min-w-0 rounded-lg border p-1 text-xs sm:min-h-24 sm:p-2 sm:text-left ${d===dia ? 'border-brand bg-orange-50 text-brand-dark' : d===hoy ? 'border-accent bg-sky-50' : 'border-tinta/10 hover:bg-crema'}`}>
            <b>{Number(d.slice(8))}</b>
            {lista.length>0 && <span className="block font-semibold text-accent-dark sm:hidden">{lista.length}</span>}
            {lista.slice(0,3).map(o=><span key={o.id} title={o.nombre} className="mt-1 hidden rounded-md bg-sky-100 px-1.5 py-1 text-sky-950 sm:block">
              {o.hora_inicio && <span className="block text-[0.65rem] font-semibold">{o.hora_inicio.slice(0,5)}</span>}
              <span className="line-clamp-2 wrap-break-word leading-tight">{o.nombre}</span>
            </span>)}
            {lista.length>3 && <span className="hidden text-tinta-suave sm:block">＋{lista.length-3}</span>}
          </Link>;
        })}
      </div>
    </section>
    <section aria-label="Operativos y asignaciones" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold first-letter:uppercase">{dia ? fechaConDia(dia) : 'Operativos del mes'}</h2>
        {dia && <Link href={url(mes)} className="text-sm underline">Ver todo el mes</Link>}
      </div>
      {!visibles.length && <p className="rounded-2xl bg-white p-5 text-sm text-tinta-suave">Sin operativos para esta vista.</p>}
      {visibles.map(o=>{
        const n = atendidos.get(o.id)?.size ?? 0, presupuesto = totalPresupuesto(o.turno?.presupuesto ?? {});
        const estimado = costoPorChequeo(presupuesto,o.meta_examenes ?? 0);
        const registrado = gastosDeOperativo(o), real = costoPorChequeo(registrado,n);
        return <article key={o.id} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="text-xs font-semibold text-tinta-suave">{fechaLegible(o.fecha)}{o.fecha_fin && o.fecha_fin!==o.fecha ? ' al '+fechaLegible(o.fecha_fin) : ''} · {o.hora_inicio && o.hora_fin ? o.hora_inicio.slice(0,5)+'–'+o.hora_fin.slice(0,5) : 'Sin horario'}</p>
              <h3 className="font-bold">{o.nombre}</h3><p className="text-sm text-tinta-suave">{o.direccion || 'Sin dirección'}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {o.estado!=='planificado' && <span className="rounded-full bg-crema px-2 py-1 text-xs capitalize">{o.estado}</span>}
              <Link href={'/operativos/'+o.id} className={btn}>Ver operativo</Link>
              {o.estado==='planificado' && <Link href={ruta+'/turno?id='+o.id} className={btn}>{o.turno ? 'Editar equipo' : 'Asignar equipo'}</Link>}
            </div>
          </div>
          {o.turno ? <dl className="my-3 grid grid-cols-2 gap-2 rounded-xl bg-sky-50 p-3 sm:grid-cols-4">
            {o.personas.map(id=>{const r=catalogo.get(id);return <div key={id} className="min-w-0"><dt className="text-xs text-tinta-suave">{r ? ROLES_AGENDA[r.tipo] : 'Recurso'}</dt><dd className="break-words text-sm font-semibold">{r?.nombre ?? 'Sin nombre'}</dd></div>;})}
          </dl> : <p className="my-3 text-sm font-medium text-amber-800">Sin equipo asignado</p>}
          {o.estado!=='cancelado' && <div className="grid grid-cols-1 gap-2 text-xs text-tinta-suave sm:grid-cols-2">
            <p><b className="text-tinta">Presupuesto {clp(presupuesto)}</b> · {o.meta_examenes ?? 0} previstos{estimado!==null && ' · '+clp(estimado)+' por chequeo'}</p>
            <p><b className="text-tinta">Gastos registrados {clp(registrado)}</b> · {n} atendidos{real!==null && ' · '+clp(real)+' por chequeo'}</p>
          </div>}
        </article>;
      })}
    </section>
  </div>;
}
