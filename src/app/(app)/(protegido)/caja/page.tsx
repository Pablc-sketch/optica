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
import { resumirCaja } from '@/lib/caja';
import CajaHistorial from '@/components/caja-historial';
import BotonEnviar from '@/components/boton-enviar';
export const dynamic = 'force-dynamic';
const campo = 'w-full min-w-0 rounded-xl border px-3 py-2.5';
export default async function Caja({ searchParams }: { searchParams: Promise<{ guardado?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const [caja, pendientes, gastos, movimientos, conteos, cobros, retiros, tenant, params] = await Promise.all([
    supabase.rpc('caja_global').single(), cargarPendientes(supabase),
    leerTodas((a,b) => supabase.from('gastos_globales').select('id,fecha,descripcion,monto,caja').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('caja_movimientos').select('id,fecha,tipo,monto,caja,gasto_id,descripcion,created_at').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('caja_conteos').select('contado,esperado,nota,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(5),
    leerTodas((a,b) => supabase.from('pagos_abonos').select('id,fecha,monto,medio_pago,venta_id,ventas!inner(anulada)').eq('tenant_id',tenantId).eq('ventas.anulada',false).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('retiros_sueldo').select('id,fecha,monto,caja,persona,operativo_id').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id',tenantId).single(),
    searchParams,
  ]);
  const error = caja.error || pendientes.error || gastos.error || movimientos.error || conteos.error || cobros.error || retiros.error || tenant.error;
  const t = caja.data as { entro_efectivo: number; salio_efectivo: number; entro_digital: number; entro_debito: number; entro_credito: number; salio_digital: number } | null;
  const efectivo = (t?.entro_efectivo ?? 0) - (t?.salio_efectivo ?? 0);
  const saldo = resumirCaja({ entroEfectivo:t?.entro_efectivo ?? 0, entroDigital:t?.entro_digital ?? 0, entroDebito:t?.entro_debito ?? 0,
    entroCredito:t?.entro_credito ?? 0, salioEfectivo:t?.salio_efectivo ?? 0, salioDigital:t?.salio_digital ?? 0 },
    { comisionDebitoPct:Number(tenant.data?.comision_debito_pct ?? 0), comisionCreditoPct:Number(tenant.data?.comision_credito_pct ?? 0) });
  const ultimoConteo = conteos.data?.[0];
  const personales = (gastos.data ?? []).filter(g => g.caja === 'personal').map(g => ({ ...g,
    pendiente: pendientePersonal(g.monto,(movimientos.data ?? []).filter(m => m.gasto_id === g.id)) })).filter(g => g.pendiente > 0).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const deudaPersonal = personales.reduce((s,g) => s+g.pendiente,0);
  const p = pendientes.resumen;
  const fecha = hoyEnChile();
  const filas = [['Pablo',p.personas.pablo],['Pamela',p.personas.madre],['Isadora',p.personas.isadora],['Fides',p.fides],['Marcos / armazones',p.marcos],['Gastos de operativos',p.gastos]] as const;
  return <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Caja</h1><Link href="/" className="text-sm underline">Inicio</Link></div>
    {params.guardado === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro guardado.</p>}
    {error ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">No se pudo leer toda la caja. Recarga antes de registrar movimientos.</p> : <>
      <div className="grid items-start gap-4 lg:grid-cols-2">
      <CuentaBancaria tenantId={tenantId} obligaciones={p.total+deudaPersonal+p.ahorro} registrado={{saldo:saldo.hayDigital,maquina:(t?.entro_debito ?? 0)+(t?.entro_credito ?? 0),transferencias:(t?.entro_digital ?? 0)-(t?.entro_debito ?? 0)-(t?.entro_credito ?? 0),salidas:saldo.salioDigital,comisiones:saldo.comisionTarjeta}} />
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Efectivo</h2><p className={`mt-2 text-4xl font-bold tabular-nums ${efectivo<0?'text-red-700':'text-emerald-800'}`}>{clp(efectivo)}</p><p className="text-xs text-tinta-suave">Saldo esperado según movimientos</p>
        <div className="mt-3 flex justify-between gap-3 text-sm"><span className="text-emerald-800">Cobros +{clp(saldo.entroEfectivo)}</span><span className="text-red-700">Salidas netas {clp(saldo.salioEfectivo)}</span></div>
        {ultimoConteo ? <div className="mt-4 rounded-xl bg-crema p-3"><p>Último efectivo contado: <b>{clp(ultimoConteo.contado)}</b></p><p className={ultimoConteo.contado===ultimoConteo.esperado?'text-emerald-800':'text-red-700'}>Diferencia al contar: <b>{clp(ultimoConteo.contado-ultimoConteo.esperado)}</b></p><p className="text-xs text-tinta-suave">{new Date(ultimoConteo.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})} · esperado entonces {clp(ultimoConteo.esperado)}</p></div> : <p className="mt-3 text-sm text-amber-900">Falta contar el efectivo para comprobar el saldo.</p>}
        <details className="mt-4"><summary className="cursor-pointer rounded-xl border px-3 py-3 font-semibold">Contar efectivo</summary><p className="my-3 text-sm text-tinta-suave">Anota lo que tienes físicamente. Si hay diferencia, revisa los movimientos.</p>
          <CajaFormulario texto="Guardar conteo"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="conteo" />
            <label className="text-sm">Dinero contado<input name="monto" type="number" min="0" step="1" required className={campo} /></label><label className="text-sm">Nota<input name="descripcion" maxLength={250} className={campo} /></label>
          </CajaFormulario>
        </details>
      </section></div>
      {(cobros.data ?? []).some(c=>!c.medio_pago) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Hay cobros antiguos sin medio de pago, incluidos como efectivo. Revísalos en el historial si hay diferencias.</p>}
      <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-emerald-50 p-4"><p className="text-sm">Utilidad calculada · operativos</p><b className={pendientes.utilidadOperativos<0?'text-2xl text-red-700':'text-2xl text-emerald-800'}>{clp(pendientes.utilidadOperativos)}</b><p className="mt-1 text-xs text-tinta-suave">Ventas menos costos del operativo. Incluye ventas por cobrar; no es saldo de caja.</p></div><Link href="/pagos/revisar" className="flex items-center justify-center rounded-2xl bg-tinta p-4 text-center font-semibold text-white">Revisar pagos y gastos →</Link></div>
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-bold text-red-700">Por pagar · {clp(p.total+deudaPersonal)}</summary>
      <div className="pt-2">
        <dl className="mt-2 divide-y divide-tinta/10">{filas.filter(([,monto])=>monto>0).map(([nombre,monto]) => <div key={nombre} className="flex justify-between gap-3 py-2"><dt>{nombre}</dt><dd className="font-semibold tabular-nums">{clp(monto)}</dd></div>)}
          <div className="flex justify-between gap-3 py-2"><dt>Devolver a Pablo · gastos personales</dt><dd className="font-semibold tabular-nums">{clp(deudaPersonal)}</dd></div>
          <div className="flex justify-between gap-3 py-3 font-bold"><dt>Total pendiente</dt><dd>{clp(p.total+deudaPersonal)}</dd></div>
        </dl><p className="text-xs text-tinta-suave">Pendientes y ahorro aún no descontados del saldo bancario.</p>
        {p.ahorro > 0 && <p className="mt-2 text-sm">Ahorro por separar: {clp(p.ahorro)}</p>}
        <Link href="/pagos" className="mt-3 inline-block rounded-xl border px-3 py-2 font-semibold">Ver y registrar pagos →</Link>
      </div>
      </details>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold text-red-700">Gastos</h2>
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
      <CajaHistorial cobros={cobros.data ?? []} gastos={gastos.data ?? []} retiros={retiros.data ?? []} traslados={movimientos.data ?? []} />
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Reportes y documentos</summary><div className="mt-3 flex flex-wrap gap-2">{[['/reportes','Reportes'],['/boleta','Boletas'],['/seguros','Reembolsos']].map(([href,n])=><Link key={href} href={href} className="rounded-xl border px-4 py-3">{n}</Link>)}</div></details>
    </>}
  </div>;
}
