import CabeceraPagina from "@/components/cabecera-pagina";
import { usaGestionGeneral } from "@/lib/modelo-optica";
import { notFound } from "next/navigation";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { guardarRecurso } from '@/lib/actions/agenda-terreno';
import { ROLES_AGENDA, type RecursoAgenda } from '@/lib/agenda-terreno';
import FormularioAgenda from '@/components/formulario-agenda';
import { leerTodas } from '@/lib/leer-todas';

const campo = 'w-full rounded-xl border bg-white px-3 py-2.5 text-base';
export default async function RecursosAgenda() {
  const {supabase,tenantId} = await exigirRolPagina(['admin']);
  if (!(await usaGestionGeneral(supabase,tenantId))) notFound();
  const r = await leerTodas((a,b)=>supabase.from('agenda_recursos').select('id,tipo,nombre,detalle,rut,titulo_profesional,registro_profesional,usuario_id').eq('tenant_id',tenantId).order('nombre').order('id').range(a,b));
  if (r.error) throw new Error('No pudimos cargar el personal y los kits');
  const equipo=(r.data??[]) as (RecursoAgenda&{rut:string|null;titulo_profesional:string|null;registro_profesional:string|null;usuario_id:string|null})[];
  const {data:usuarios,error:fallo}=await supabase.from('users').select('id,nombre').eq('tenant_id',tenantId).eq('estado','activo').order('nombre');if(fallo)throw new Error('No se pudieron cargar las cuentas.');
  const camposProfesional=(e?:typeof equipo[number])=><details className="rounded-xl border p-3"><summary className="cursor-pointer text-sm font-semibold">Datos del tecnólogo para recetas</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
   <label className="text-sm">RUT<input name="rut" maxLength={30} defaultValue={e?.rut??''} className={campo}/></label><label className="text-sm">Título profesional<input name="titulo_profesional" maxLength={160} defaultValue={e?.titulo_profesional??''} className={campo}/></label><label className="text-sm">Registro profesional<input name="registro_profesional" maxLength={100} defaultValue={e?.registro_profesional??''} className={campo}/></label><label className="text-sm">Cuenta de acceso (opcional)<select name="usuario_id" defaultValue={e?.usuario_id??''} className={campo}><option value="">Sin cuenta</option>{(usuarios??[]).map(u=><option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>
  </div></details>;
  return <div className="space-y-5">
    <Link href="/agenda/equipos" className="text-sm underline">← Agenda de equipos</Link>
    <CabeceraPagina seccion="En terreno" titulo="Personal" acciones={<Link href="/agenda/equipos/kits" className="rounded-xl border bg-white px-4 py-3 font-semibold">Inventario y kits</Link>}/>
    <details className="rounded-2xl bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold">＋ Agregar persona</summary>
      <div className="mt-3"><FormularioAgenda accion={guardarRecurso} limpiar etiqueta="Agregar">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">Tipo<select name="tipo" className={campo}>{Object.entries(ROLES_AGENDA).filter(([k])=>k!=='kit').map(([k,v])=><option value={k} key={k}>{v}</option>)}</select></label>
          <label className="text-sm font-medium">Nombre<input required name="nombre" maxLength={100} className={campo} /></label>
          <label className="text-sm font-medium">Detalle del equipo<input name="detalle" maxLength={250} placeholder="Opcional" className={campo} /></label>
        </div>
        {camposProfesional()}
      </FormularioAgenda></div>
    </details>
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(ROLES_AGENDA).filter(([k])=>k!=='kit').map(([k,v])=>{
        const grupo=equipo.filter(e=>e.tipo===k);
        return <section key={k} className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-bold">{v} <span className="ml-1 text-sm text-tinta-suave">· {grupo.length}</span></h2>
          {!grupo.length && <p className="text-sm text-tinta-suave">Sin registros.</p>}
          {grupo.map(e=><details key={e.id} className="border-t border-tinta/10 py-2">
            <summary className="cursor-pointer text-sm font-semibold">{e.nombre}</summary>
            {e.detalle && <p className="mt-1 text-xs text-tinta-suave">{e.detalle}</p>}
            <div className="mt-2"><FormularioAgenda accion={guardarRecurso}>
              <input type="hidden" name="id" value={e.id} />
              <label className="block text-sm">Nombre<input name="nombre" defaultValue={e.nombre} className={campo} maxLength={100} required /></label>
              <label className="block text-sm">Detalle<input name="detalle" defaultValue={e.detalle} className={campo} maxLength={250} /></label>
              {e.tipo==='tecnologo'&&camposProfesional(e)}
            </FormularioAgenda></div>
          </details>)}
        </section>;
      })}
    </div>
  </div>;
}
