import { esPilotoTerreno } from "@/lib/piloto-terreno";
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { exigirRolPagina } from '@/lib/autorizacion';
import { guardarTurno } from '@/lib/actions/agenda-terreno';
import { ROLES_AGENDA,GASTOS_AGENDA,uuidAgenda,type Presupuesto,type RecursoAgenda } from '@/lib/agenda-terreno';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import { hoyEnChile } from '@/lib/fechas';
import FormularioAgenda from '@/components/formulario-agenda';
import { leerTodas } from '@/lib/leer-todas';

const campo = 'w-full rounded-xl border bg-white px-3 py-2.5 text-base';
type Turno = { vendedora_id: string; tecnologo_id: string; coordinador_id: string; kit_id: string; presupuesto: Presupuesto };
export default async function EditarTurno({ searchParams }: {searchParams:Promise<{id?:string;dia?:string}>}) {
  const p = await searchParams;
  if (p.id && !uuidAgenda.test(p.id)) notFound();
  const {supabase,tenantId} = await exigirRolPagina(['admin']);
  if (!esPilotoTerreno(tenantId)) notFound();
  const [r,o] = await Promise.all([
    leerTodas((a,b)=>supabase.from('agenda_recursos').select('id,tipo,nombre,detalle').eq('tenant_id',tenantId).order('nombre').order('id').range(a,b)),
    p.id ? supabase.from('operativos').select('id,nombre,direccion,fecha,fecha_fin,hora_inicio,hora_fin,estado,meta_examenes,agenda_turnos(vendedora_id,tecnologo_id,coordinador_id,kit_id,presupuesto)').eq('id',p.id).eq('tenant_id',tenantId).maybeSingle() : null,
  ]);
  if (r.error || o?.error) throw new Error('No pudimos cargar el operativo');
  const op = o?.data;
  if (p.id && (!op || op.estado !== 'planificado')) notFound();
  const rel = op?.agenda_turnos as unknown as Turno | Turno[] | null;
  const turno = Array.isArray(rel) ? rel[0] : rel;
  const equipo = (r.data ?? []) as RecursoAgenda[];
  const faltan = Object.keys(ROLES_AGENDA).filter(tipo=>!equipo.some(e=>e.tipo===tipo));
  const fecha = op?.fecha ?? (fechaValidaDocumento(p.dia) ? p.dia : hoyEnChile());
  return <div className="mx-auto max-w-3xl space-y-4">
    <Link href={'/agenda/equipos?mes='+fecha.slice(0,7)+'&dia='+fecha} className="text-sm underline">← Agenda de equipos</Link>
    <h1 className="text-2xl font-bold">{op ? 'Editar operativo' : 'Agendar operativo'}</h1>
    {faltan.length>0 ? <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm">Agrega al menos una persona de cada rol y un kit.</p><Link href="/agenda/equipos/recursos" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-white">Configurar personal y kits</Link></div>
    : <div className="rounded-2xl bg-white p-4 shadow-sm sm:p-5"><FormularioAgenda accion={guardarTurno} etiqueta="Guardar operativo">
      <input name="id" type="hidden" value={op?.id ?? randomUUID()} />
      <input name="editar" type="hidden" value={op ? 'si' : 'no'} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">Nombre del operativo<input name="nombre" defaultValue={op?.nombre} required maxLength={120} className={campo} /></label>
        <label className="text-sm font-medium">Lugar o dirección<input name="direccion" defaultValue={op?.direccion ?? ''} required maxLength={220} className={campo} /></label>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="min-w-0 text-sm font-medium">Día<input type="date" name="fecha" defaultValue={fecha} required className={campo} /></label>
        <label className="min-w-0 text-sm font-medium">Inicio<input type="time" name="inicio" defaultValue={op?.hora_inicio?.slice(0,5) ?? '09:00'} required className={campo} /></label>
        <label className="min-w-0 text-sm font-medium">Término<input type="time" name="fin" defaultValue={op?.hora_fin?.slice(0,5) ?? '13:00'} required className={campo} /></label>
        <label className="min-w-0 text-sm font-medium">Último día (opcional)<input type="date" name="fecha_fin" defaultValue={op?.fecha_fin ?? ''} className={campo} /></label>
      </div>
      <h2 className="pt-2 font-bold">Equipo asignado</h2>
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(ROLES_AGENDA).map(([k,v])=><label key={k} className="min-w-0 text-sm font-medium">{v}
          <select className={campo} required name={k} defaultValue={turno?.[(k+'_id') as Exclude<keyof Turno,'presupuesto'>] ?? ''}>
            <option value="">Elegir…</option>
            {equipo.filter(e=>e.tipo===k).map(e=><option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </label>)}
      </div>
      <details className="rounded-xl border border-tinta/15 p-3" open={Boolean(turno && Object.values(turno.presupuesto).some(n=>n>0))}>
        <summary className="cursor-pointer font-semibold">Presupuesto y chequeos</summary>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Chequeos previstos<input name="meta" type="number" min={0} max={10000} step={1} defaultValue={op?.meta_examenes ?? ''} placeholder="0" className={campo} /></label>
          {Object.entries(GASTOS_AGENDA).map(([k,v])=><label key={k} className="text-sm font-medium">{v}<input type="number" min={0} max={999999999} step={1} name={k} defaultValue={turno?.presupuesto[k as keyof Presupuesto] ?? ''} placeholder="$0" className={campo} /></label>)}
        </div>
        <p className="mt-2 text-xs text-tinta-suave">Los gastos reales se registran en el operativo.</p>
      </details>
    </FormularioAgenda></div>}
  </div>;
}
