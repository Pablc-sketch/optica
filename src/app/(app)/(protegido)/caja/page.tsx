import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { exigirRolPagina } from '@/lib/autorizacion';
import { cargarPendientes } from '@/lib/resumen-pendientes';
import { leerTodas } from '@/lib/leer-todas';
import { clp } from '@/lib/clp';
import { hoyEnChile, fechaLegible } from '@/lib/fechas';
import { pendientePersonal } from '@/lib/caja-fuentes';
import { crearGastoGlobal } from '@/lib/actions/gastos';
import CuentaBancaria from '@/components/cuenta-bancaria';
import CajaFormulario from '@/components/caja-formulario';
import BotonEnviar from '@/components/boton-enviar';
export const dynamic = 'force-dynamic';
const campo = 'w-full min-w-0 rounded-xl border px-3 py-2.5';
export default async function Caja({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const [caja, pendientes, gastos, movimientos, conteos, params] = await Promise.all([
    supabase.rpc('caja_global').single(), cargarPendientes(supabase),
    leerTodas((a,b) => supabase.from('gastos_globales').select('id,fecha,descripcion,monto,caja').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('caja_movimientos').select('id,fecha,tipo,monto,caja,gasto_id,descripcion,created_at').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('caja_conteos').select('contado,esperado,nota,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(5),
    searchParams,
  ]);
  const error = caja.error || pendientes.error || gastos.error || movimientos.error || conteos.error;
  const t = caja.data as { entro_efectivo: number; salio_efectivo: number } | null;
  const efectivo = (t?.entro_efectivo ?? 0) - (t?.salio_efectivo ?? 0);
  const personales = (gastos.data ?? []).filter(g => g.caja === 'personal').map(g => ({ ...g,
    pendiente: pendientePersonal(g.monto,(movimientos.data ?? []).filter(m => m.gasto_id === g.id)) })).filter(g => g.pendiente > 0).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const deudaPersonal = personales.reduce((s,g) => s+g.pendiente,0);
  const p = pendientes.resumen;
  const fecha = hoyEnChile();
  const filas = [['Pablo',p.personas.pablo],['Pamela',p.personas.madre],['Isadora',p.personas.isadora],['Fides',p.fides],['Marcos / armazones',p.marcos],['Gastos de operativos',p.gastos]] as const;
  return <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Caja</h1><Link href="/" className="text-sm underline">Inicio</Link></div>
    {params.guardado === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro guardado.</p>}
    <CuentaBancaria tenantId={tenantId} obligaciones={error ? undefined : p.total+deudaPersonal+p.ahorro} />
    {error ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">No se pudo leer toda la caja. Recarga antes de registrar movimientos.</p> : <>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Por pagar</h2>
        <dl className="mt-2 divide-y divide-tinta/10">{filas.map(([nombre,monto]) => <div key={nombre} className="flex justify-between gap-3 py-2"><dt>{nombre}</dt><dd className="font-semibold tabular-nums">{clp(monto)}</dd></div>)}
          <div className="flex justify-between gap-3 py-2"><dt>Devolver a Pablo · gastos personales</dt><dd className="font-semibold tabular-nums">{clp(deudaPersonal)}</dd></div>
          <div className="flex justify-between gap-3 py-3 font-bold"><dt>Total pendiente</dt><dd>{clp(p.total+deudaPersonal)}</dd></div>
        </dl><p className="text-xs text-tinta-suave">Pendientes y ahorro aún no descontados del saldo bancario.</p>
        {p.ahorro > 0 && <p className="mt-2 text-sm">Ahorro por separar: {clp(p.ahorro)}</p>}
        <Link href="/pagos" className="mt-3 inline-block rounded-xl border px-3 py-2 font-semibold">Ver y registrar pagos →</Link>
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Efectivo</h2><p className="mt-1 text-3xl font-bold tabular-nums">{clp(efectivo)}</p><p className="text-sm text-tinta-suave">Según movimientos registrados.</p>
        <details className="mt-4"><summary className="cursor-pointer py-2 font-semibold">Contar y cuadrar efectivo</summary><p className="mb-3 text-sm text-tinta-suave">Cuenta todo el efectivo de la óptica. Guardar el conteo no corrige diferencias.</p>
          <CajaFormulario texto="Guardar conteo"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="conteo" />
            <label className="text-sm">Efectivo contado<input name="monto" type="number" min="0" step="1" required className={campo} /></label>
            <label className="text-sm">Nota opcional<input name="descripcion" maxLength={250} className={campo} /></label>
          </CajaFormulario>
        </details>
        {(conteos.data ?? []).map(c => <p key={c.created_at} className="mt-3 border-t pt-3 text-sm">{new Date(c.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}: contado <b>{clp(c.contado)}</b> · esperado {clp(c.esperado)} · diferencia <b>{clp(c.contado-c.esperado)}</b>{c.nota && <> · {c.nota}</>}</p>)}
      </section>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Gastos</h2>
        <details className="mt-2"><summary className="cursor-pointer py-2 font-semibold">Agregar gasto ya pagado</summary>
          <form action={crearGastoGlobal} className="mt-3 grid gap-3"><input type="hidden" name="volver_caja" value="1" /><input type="hidden" name="id" value={randomUUID()} />
            <label className="text-sm">Qué se pagó<input name="descripcion" placeholder="Arriendo del equipo, bandejas…" maxLength={250} required className={campo} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} max={fecha} required className={campo} /></label><label className="text-sm">Monto<input name="monto" type="number" min="1" step="1" required className={campo} /></label></div>
            <label className="text-sm">De dónde salió<select name="caja" required defaultValue="" className={campo}><option value="" disabled>Elige el origen</option><option value="digital">Cuenta bancaria (Mercado Pago)</option><option value="efectivo">Efectivo de la óptica</option><option value="personal">Dinero personal de Pablo</option></select></label>
            <label className="text-sm">Categoría<select name="categoria" className={campo}><option value="otro">Otro gasto</option><option value="arriendo">Arriendo</option><option value="compra_inventario">Inventario / equipamiento</option></select></label>
            <p className="text-xs text-tinta-suave">Si ya está registrado en un operativo o en Reportes, no lo agregues otra vez.</p>
            <BotonEnviar className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">Guardar gasto</BotonEnviar>
          </form>
        </details>
        <details className="mt-2"><summary className="cursor-pointer py-2 font-semibold">Gastos personales por devolver · {clp(deudaPersonal)}</summary>
          {personales.length === 0 ? <p className="mt-2 text-sm">Sin gastos personales pendientes registrados.</p> : personales.map(g => <div key={g.id} className="mt-3 border-t pt-3"><p className="font-semibold">{g.descripcion} · {clp(g.pendiente)}</p><p className="mb-2 text-sm text-tinta-suave">{fechaLegible(g.fecha)} · pagado personalmente por Pablo</p>
            <CajaFormulario texto="Registrar devolución ya realizada"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="devolucion" /><input type="hidden" name="gasto_id" value={g.id} /><input type="hidden" name="descripcion" value={`Devolución a Pablo: ${g.descripcion}`.slice(0,250)} />
              <label className="text-sm">Monto devuelto<input type="number" name="monto" min="1" max={g.pendiente} step="1" required className={campo} /></label>
              <label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} min={g.fecha} max={fecha} required className={campo} /></label>
              <label className="text-sm">Se devolvió desde<select name="caja" className={campo}><option value="digital">Cuenta bancaria (Mercado Pago)</option><option value="efectivo">Efectivo</option></select></label>
            </CajaFormulario>
          </div>)}
        </details>
      </section>
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Trasladar entre efectivo y cuenta</summary><p className="my-3 text-sm text-tinta-suave">Registra un depósito o retiro que ya hiciste. Lentia no mueve dinero.</p>
        <CajaFormulario><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="caja" value="digital" />
          <label className="text-sm">Movimiento<select name="tipo" className={campo}><option value="deposito">Depositaste efectivo en Mercado Pago</option><option value="retiro">Retiraste efectivo de Mercado Pago</option></select></label>
          <label className="text-sm">Monto<input type="number" name="monto" min="1" step="1" required className={campo} /></label>
          <label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} max={fecha} required className={campo} /></label>
          <label className="text-sm">Descripción<input name="descripcion" maxLength={250} required className={campo} /></label>
        </CajaFormulario>
      </details>
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Últimos gastos y traslados</summary><ul className="mt-3 divide-y divide-tinta/10">{[
        ...(gastos.data ?? []).map(g => ({ id:g.id,fecha:g.fecha,descripcion:g.descripcion,monto:g.monto,origen:g.caja==='personal'?'Pablo · personal':g.caja==='digital'?'Mercado Pago':'Efectivo' })),
        ...(movimientos.data ?? []).map(m => ({ id:m.id,fecha:m.fecha,descripcion:m.descripcion,monto:m.monto,origen:m.tipo==='deposito'?'Efectivo → Mercado Pago':m.tipo==='retiro'?'Mercado Pago → efectivo':`Devolución desde ${m.caja==='digital'?'Mercado Pago':'efectivo'}` })),
      ].sort((a,b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id)).slice(0,20).map(m => <li key={m.id} className="py-3"><p className="flex justify-between gap-3"><span>{m.descripcion}</span><b className="shrink-0">{clp(m.monto)}</b></p><p className="text-xs text-tinta-suave">{fechaLegible(m.fecha)} · {m.origen}</p></li>)}</ul></details>
    </>}
  </div>;
}
