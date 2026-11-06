import CabeceraPagina from "@/components/cabecera-pagina";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
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
import { resumirCaja, disponibleTrasPendientes } from '@/lib/caja';
import CajaHistorial from '@/components/caja-historial';
import BotonEnviar from '@/components/boton-enviar';
export const dynamic = 'force-dynamic';
const campo = 'w-full min-w-0 rounded-xl border px-3 py-2.5';
export default async function Caja({ searchParams }: { searchParams: Promise<{ guardado?: string; ver?: string; operativo?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const piloto = esPilotoTerreno(tenantId);
  const [caja, pendientes, gastos, movimientos, conteos, cobros, retiros, tenant, ventas, operativos, params] = await Promise.all([
    supabase.rpc('caja_global').single(), cargarPendientes(supabase),
    leerTodas((a,b) => supabase.from('gastos_globales').select('id,fecha,descripcion,monto,caja,operativo_id').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('caja_movimientos').select('id,fecha,tipo,monto,caja,gasto_id,descripcion,created_at').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('caja_conteos').select('contado,esperado,nota,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(5),
    leerTodas((a,b) => supabase.from('pagos_abonos').select('id,fecha,monto,medio_pago,venta_id,ventas!inner(anulada)').eq('tenant_id',tenantId).eq('ventas.anulada',false).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('retiros_sueldo').select('id,fecha,monto,caja,persona,operativo_id').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id',tenantId).single(),
    leerTodas((a,b) => supabase.from('ventas').select('id,total,operativo_id,pagos_abonos(monto)').eq('tenant_id',tenantId).eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('operativos').select('id,nombre,fecha').eq('tenant_id',tenantId).order('id').range(a,b)),
    searchParams,
  ]);
  const error = caja.error || pendientes.error || gastos.error || movimientos.error || conteos.error || cobros.error || retiros.error || tenant.error || ventas.error || operativos.error;
  const t = caja.data as { entro_efectivo: number; salio_efectivo: number; entro_digital: number; entro_debito: number; entro_credito: number; salio_digital: number } | null;
  const efectivo = (t?.entro_efectivo ?? 0) - (t?.salio_efectivo ?? 0);
  const saldo = resumirCaja({ entroEfectivo:t?.entro_efectivo ?? 0, entroDigital:t?.entro_digital ?? 0, entroDebito:t?.entro_debito ?? 0,
    entroCredito:t?.entro_credito ?? 0, salioEfectivo:t?.salio_efectivo ?? 0, salioDigital:t?.salio_digital ?? 0 },
    { comisionDebitoPct:Number(tenant.data?.comision_debito_pct ?? 0), comisionCreditoPct:Number(tenant.data?.comision_credito_pct ?? 0) });
  const ultimoConteo = conteos.data?.[0];
  const personales = (gastos.data ?? []).filter(g => g.caja === 'personal').map(g => ({ ...g,
    pendiente: pendientePersonal(g.monto,(movimientos.data ?? []).filter(m => m.gasto_id === g.id)) })).filter(g => g.pendiente > 0).sort((a,b) => a.fecha.localeCompare(b.fecha));
  const deudaPersonal = personales.reduce((s,g) => s+g.pendiente,0);
  const base = pendientes.resumen;
  const p = piloto ? {...base,total:base.costos,ahorro:0,personas:{pablo:0,madre:0,isadora:0}} : base;
  const disponible = disponibleTrasPendientes(saldo, { pagos: p.total, devoluciones: deudaPersonal, ahorro: p.ahorro });
  const vistas = [['resumen','Resumen'],['movimientos','Movimientos'],['pendientes','Pendientes'],['cuadrar','Cuadrar']] as const;
  const vista = vistas.find(([clave]) => clave === params.ver)?.[0] ?? 'resumen';
  const operativoId = (vista==='movimientos'||vista==='pendientes') && (operativos.data ?? []).some(o => o.id === params.operativo) ? params.operativo! : '';
  const ventasFiltradas = (ventas.data ?? []).filter(v => !operativoId || v.operativo_id === operativoId);
  const operativoPorVenta = new Map((ventas.data ?? []).map(v => [v.id,v.operativo_id]));
  const porCobrar = ventasFiltradas.reduce((s,v) => s + Math.max(0, v.total - v.pagos_abonos.reduce((s,p) => s+p.monto,0)),0);
  const ahorroSeparado = (retiros.data ?? []).filter(r => r.persona === 'ahorro').reduce((s,r) => s+r.monto,0);
  const pendientesFiltrados = p.operativos.filter(o => !operativoId || o.operativoId === operativoId);
  const fecha = hoyEnChile();
  const filas = [['Pablo',p.personas.pablo],['Pamela',p.personas.madre],['Isadora',p.personas.isadora],['Fides',p.fides],['Marcos / armazones',p.marcos],['Gastos de operativos',p.gastos]] as const;
  return <div className="flex flex-col gap-5">
    <CabeceraPagina seccion="Operación" titulo="Caja" />
    <nav aria-label="Finanzas" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{vistas.map(([clave,nombre]) => <Link key={clave} href={`/caja?ver=${clave}`} aria-current={vista===clave?'page':undefined} className={`rounded-xl px-3 py-3 text-center font-semibold ${vista===clave?'bg-sidebar-active text-white':'bg-white shadow-sm hover:bg-sky-50'}`}>{nombre}</Link>)}</nav>
    {(vista==='movimientos'||vista==='pendientes') && <form action="/caja" className="flex flex-wrap items-end gap-2"><input type="hidden" name="ver" value={vista} /><label className="min-w-0 flex-1 text-sm">Operativo<select name="operativo" defaultValue={operativoId} className={campo}><option value="">Todos los operativos</option>{[...(operativos.data ?? [])].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(o=><option key={o.id} value={o.id}>{o.nombre} · {fechaLegible(o.fecha)}</option>)}</select></label><button className="rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Ver</button></form>}
    {params.guardado === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro guardado.</p>}
    {error ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">No se pudo leer toda la caja. Recarga antes de registrar movimientos.</p> : <>
      {vista==='resumen' && <>
      <div className="grid items-start gap-4 xl:grid-cols-3">
        <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold text-tinta-suave">Efectivo registrado</h2><p className={`mt-3 text-3xl font-bold tabular-nums ${efectivo<0?'text-red-700':'text-tinta'}`}>{clp(efectivo)}</p><p className="mt-2 text-xs text-tinta-suave">Esperado según movimientos</p>{ultimoConteo ? <p className="mt-3 text-sm">Último conteo: <b>{clp(ultimoConteo.contado)}</b><span className={`block ${ultimoConteo.contado===ultimoConteo.esperado?'text-emerald-800':'text-red-700'}`}>Diferencia entonces: {clp(ultimoConteo.contado-ultimoConteo.esperado)}</span></p> : <p className="mt-3 text-sm text-amber-900">Por contar</p>}</section>
        <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-sm font-semibold text-tinta-suave">Cuenta bancaria · registrada</h2><p className={`mt-3 text-3xl font-bold tabular-nums ${saldo.hayDigital<0?'text-red-700':'text-tinta'}`}>{clp(saldo.hayDigital)}</p><p className="mt-2 text-xs text-tinta-suave">Mercado Pago + transferencias · comisiones estimadas</p><Link href="/caja?ver=cuadrar" className="mt-3 inline-block text-sm font-semibold underline">Comprobar saldo bancario →</Link></section>
        <section className={`rounded-2xl p-5 shadow-sm ${disponible.restante<0?'bg-red-50':'bg-emerald-50'}`} aria-labelledby="resumen-caja"><h2 id="resumen-caja" className="text-sm font-semibold">Disponible tras pendientes</h2><p className={`mt-3 text-3xl font-bold tabular-nums ${disponible.restante<0?'text-red-700':'text-emerald-800'}`}>{clp(disponible.restante)}</p><p className="mt-2 text-xs">{clp(disponible.total)} − {clp(disponible.porPagar)} por pagar − {clp(disponible.ahorro)} ahorro</p><p className="mt-3 text-xs text-tinta-suave">Estimación registrada, sin ventas por cobrar.</p></section>
      </div>
      <nav aria-label="Acciones de caja" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/cobros" className="rounded-xl bg-emerald-800 px-4 py-4 text-center font-semibold text-white">+ Cobrar venta</Link>
        <Link href="/caja?ver=movimientos#nuevo-gasto" className="rounded-xl bg-white px-4 py-4 text-center font-semibold shadow-sm">− Gasto</Link>
        <Link href={piloto ? "/agenda/equipos" : "/pagos"} className="rounded-xl bg-white px-4 py-4 text-center font-semibold shadow-sm">{piloto ? 'Gastos por operativo' : 'Registrar pago'}</Link>
        <Link href="/caja?ver=movimientos#traspasos" className="rounded-xl bg-white px-4 py-4 text-center font-semibold shadow-sm">Transferir entre cuentas</Link>
      </nav>
      <Link href="/caja?ver=cuadrar" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900"><span><b className="block">Conciliar caja</b><span className="text-sm">Confirma el efectivo contado y el saldo bancario.</span></span><span className="text-sm font-semibold">Revisar saldos →</span></Link>
      {pendientes.sinAsignar && <Link href={piloto ? "/reportes" : "/pagos/revisar"} className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 underline">Hay pagos o aportes sin operativo. Revisar →</Link>}
      {(cobros.data ?? []).some(c=>!c.medio_pago) && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Hay cobros sin medio de pago, incluidos como efectivo. Revísalos si hay diferencias.</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CajaHistorial operativos={operativos.data ?? []} cobros={(cobros.data ?? []).map(c=>({...c,operativo_id:operativoPorVenta.get(c.venta_id) ?? null}))} gastos={gastos.data ?? []} retiros={retiros.data ?? []} traslados={movimientos.data ?? []} />
        <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-bold">Por pagar</h2><p className="mt-2 text-sm text-red-700">Compromisos pendientes · {clp(p.total+deudaPersonal)}</p><dl className="mt-4 divide-y divide-tinta/10">{filas.filter(([,monto])=>monto>0).map(([nombre,monto])=><div key={nombre} className="flex justify-between gap-3 py-3 text-sm"><dt>{nombre}</dt><dd className="font-semibold tabular-nums text-red-700">{clp(monto)}</dd></div>)}{deudaPersonal>0 && <div className="flex justify-between gap-3 py-3 text-sm"><dt>{piloto ? 'Gastos por reembolsar' : 'Devolver a Pablo'}</dt><dd className="font-semibold text-red-700">{clp(deudaPersonal)}</dd></div>}</dl><Link href="/caja?ver=pendientes" className="mt-3 block text-sm font-semibold underline">Ver por operativo →</Link><div className="mt-5 border-t border-tinta/10 pt-4"><h3 className="text-sm">Utilidad calculada · operativos</h3><p className={`mt-2 text-3xl font-bold ${pendientes.utilidadOperativos<0?'text-red-700':'text-emerald-800'}`}>{clp(pendientes.utilidadOperativos)}</p><p className="mt-2 text-xs text-tinta-suave">Ventas menos costos. Incluye ventas por cobrar; no es saldo disponible.</p><Link href={piloto ? "/reportes" : "/pagos/revisar"} className="mt-4 block rounded-xl border px-3 py-3 text-center font-semibold">{piloto ? 'Ver reportes →' : 'Ahorro, pagos y retiros →'}</Link></div></section>
      </div>
      <div className="grid grid-cols-2 gap-3"><Link href="/cobros" className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm text-tinta-suave">Clientes por cobrar</p><b className="text-2xl tabular-nums">{clp(porCobrar)}</b></Link><Link href={piloto ? "/reportes" : "/pagos/revisar"} className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm text-tinta-suave">Ahorro registrado</p><b className="text-2xl text-emerald-800 tabular-nums">{clp(ahorroSeparado)}</b></Link></div>
      <p className="text-xs text-tinta-suave">Los traspasos no son ingresos. Los pagos realizados reducen el saldo.</p>
      </>}
      {vista==='pendientes' && <>
      <div className="grid grid-cols-2 gap-3"><Link href="/cobros" className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm">Clientes por cobrar</p><b className="text-2xl tabular-nums">{clp(porCobrar)}</b><p className="mt-2 text-sm underline">Gestionar cobros →</p></Link><Link href={piloto ? "/reportes" : "/pagos/revisar"} className="rounded-2xl bg-tinta p-4 font-semibold text-white">Confirmar o corregir pagos, gastos y ahorro →</Link></div>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Por operativo</h2>
      {pendientesFiltrados.length===0 && <p className="mt-3 text-sm">Sin pagos ni ahorro pendientes.</p>}
      {pendientesFiltrados.map(o=><Link key={o.operativoId} href={`/operativos/${o.operativoId}/cierre`} className="mt-3 block rounded-xl border p-3"><b>{o.nombre}</b><p className="text-xs text-tinta-suave">{fechaLegible(o.fecha)}</p><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{[['Fides',o.fides],['Marcos',o.marcos],['Gastos',o.gastos],['Pablo',o.personas.pablo],['Pamela',o.personas.madre],['Isadora',o.personas.isadora],['Ahorro por separar',o.ahorro]].map(([n,m])=><div key={n} className="flex justify-between gap-2"><dt>{n}</dt><dd className="tabular-nums">{clp(Number(m))}</dd></div>)}</dl></Link>)}
      </section>
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-bold text-red-700">Total de la óptica por pagar · {clp(p.total+deudaPersonal)}</summary>
      <div className="pt-2">
        <dl className="mt-2 divide-y divide-tinta/10">{filas.filter(([,monto])=>monto>0).map(([nombre,monto]) => <div key={nombre} className="flex justify-between gap-3 py-2"><dt>{nombre}</dt><dd className="font-semibold tabular-nums">{clp(monto)}</dd></div>)}
          <div className="flex justify-between gap-3 py-2"><dt>{piloto ? 'Gastos por reembolsar' : 'Devolver a Pablo · gastos personales'}</dt><dd className="font-semibold tabular-nums">{clp(deudaPersonal)}</dd></div>
          <div className="flex justify-between gap-3 py-3 font-bold"><dt>Total pendiente</dt><dd>{clp(p.total+deudaPersonal)}</dd></div>
        </dl><p className="text-xs text-tinta-suave">Pendientes y ahorro aún no descontados del saldo bancario.</p>
        {p.ahorro > 0 && <p className="mt-2 text-sm">Ahorro por separar: {clp(p.ahorro)}</p>}
        <Link href={piloto ? "/agenda/equipos" : "/pagos"} className="mt-3 inline-block rounded-xl border px-3 py-2 font-semibold">Ver y registrar pagos →</Link>
      </div>
      </details>
      </>}
      {vista==='movimientos' && <>
      <section id="nuevo-gasto" className="scroll-mt-6 rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold text-red-700">Gastos</h2>
        <details className="mt-2"><summary className="cursor-pointer py-2 font-semibold">Agregar gasto general ya pagado</summary>
          <form action={crearGastoGlobal} className="mt-3 grid gap-3"><input type="hidden" name="volver_caja" value="1" /><input type="hidden" name="id" value={randomUUID()} />
            <label className="text-sm">Qué se pagó<input name="descripcion" placeholder="Arriendo del equipo, bandejas…" maxLength={250} required className={campo} /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} max={fecha} required className={campo} /></label><label className="text-sm">Monto<input name="monto" type="number" min="1" step="1" required className={campo} /></label></div>
            <label className="text-sm">De dónde salió<select name="caja" required defaultValue="" className={campo}><option value="" disabled>Elige el origen</option><option value="digital">{piloto ? 'Cuenta bancaria' : 'Cuenta bancaria (Mercado Pago)'}</option><option value="efectivo">Efectivo de la óptica</option><option value="personal">{piloto ? 'Fondo personal' : 'Dinero personal de Pablo'}</option></select></label>
            <label className="text-sm">Categoría<select name="categoria" className={campo}><option value="otro">Otro gasto</option><option value="arriendo">Arriendo</option><option value="compra_inventario">Inventario / equipamiento</option></select></label>
            <p className="text-xs text-tinta-suave">Si ya está registrado en un operativo o en Reportes, no lo agregues otra vez.</p>
            <BotonEnviar className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">Guardar gasto</BotonEnviar>
          </form>
        </details>
      </section>
      <details id="traspasos" open className="scroll-mt-6 rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Trasladar entre efectivo y cuenta</summary><p className="my-3 text-sm text-tinta-suave">Registra un depósito o retiro que ya hiciste. Lentia no mueve dinero.</p>
        <CajaFormulario><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="caja" value="digital" />
          <label className="text-sm">Movimiento<select name="tipo" className={campo}><option value="deposito">Depositaste efectivo en Mercado Pago</option><option value="retiro">Retiraste efectivo de Mercado Pago</option></select></label>
          <label className="text-sm">Monto<input type="number" name="monto" min="1" step="1" required className={campo} /></label>
          <label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} max={fecha} required className={campo} /></label>
          <label className="text-sm">Descripción<input name="descripcion" maxLength={250} required className={campo} /></label>
        </CajaFormulario>
      </details>
      <CajaHistorial key={operativoId} operativoId={operativoId} operativos={operativos.data ?? []} cobros={(cobros.data ?? []).map(c=>({...c,operativo_id:operativoPorVenta.get(c.venta_id) ?? null}))} gastos={gastos.data ?? []} retiros={retiros.data ?? []} traslados={movimientos.data ?? []} />
      </>}
      {vista==='cuadrar' && <>
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Cuadrar efectivo</h2><p className="mt-2 text-sm">Esperado según Lentia</p><p className="text-3xl font-bold tabular-nums">{clp(efectivo)}</p>
      {ultimoConteo && <p className="mt-3 text-sm">Último conteo: {clp(ultimoConteo.contado)} · diferencia entonces: {clp(ultimoConteo.contado-ultimoConteo.esperado)} · {new Date(ultimoConteo.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</p>}
        <details className="mt-4"><summary className="cursor-pointer rounded-xl border px-3 py-3 font-semibold">Contar efectivo</summary><p className="my-3 text-sm text-tinta-suave">Anota lo que tienes físicamente. Si hay diferencia, revisa los movimientos.</p>
          <CajaFormulario texto="Guardar conteo"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="conteo" />
            <label className="text-sm">Dinero contado<input name="monto" type="number" min="0" step="1" required className={campo} /></label><label className="text-sm">Nota<input name="descripcion" maxLength={250} className={campo} /></label>
          </CajaFormulario>
        </details>
      </section>
      <CuentaBancaria tenantId={tenantId} registrado={{saldo:saldo.hayDigital,maquina:(t?.entro_debito ?? 0)+(t?.entro_credito ?? 0),transferencias:(t?.entro_digital ?? 0)-(t?.entro_debito ?? 0)-(t?.entro_credito ?? 0),salidas:saldo.salioDigital,comisiones:saldo.comisionTarjeta}} />
      <Link href="/caja?ver=movimientos" className="rounded-xl bg-white p-4 text-center font-semibold">Revisar movimientos y diferencias →</Link>
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <details className="mt-2"><summary className="cursor-pointer py-2 font-semibold">Gastos personales por devolver · {clp(deudaPersonal)}</summary>
          {personales.length === 0 ? <p className="mt-2 text-sm">Sin gastos personales pendientes registrados.</p> : personales.map(g => <div key={g.id} className="mt-3 border-t pt-3"><p className="font-semibold">{g.descripcion} · {clp(g.pendiente)}</p><p className="mb-2 text-sm text-tinta-suave">{fechaLegible(g.fecha)}{piloto ? ' · Fondo personal' : ' · pagado personalmente por Pablo'}</p>
            <CajaFormulario texto="Registrar devolución ya realizada"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="devolucion" /><input type="hidden" name="gasto_id" value={g.id} /><input type="hidden" name="descripcion" value={`Devolución a Pablo: ${g.descripcion}`.slice(0,250)} />
              <label className="text-sm">Monto devuelto<input type="number" name="monto" min="1" max={g.pendiente} step="1" required className={campo} /></label>
              <label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={fecha} min={g.fecha} max={fecha} required className={campo} /></label>
              <label className="text-sm">Se devolvió desde<select name="caja" className={campo}><option value="digital">Cuenta bancaria (Mercado Pago)</option><option value="efectivo">Efectivo</option></select></label>
            </CajaFormulario>
          </div>)}
        </details>

      </section>
      </>}
      {vista==='resumen' && <>

      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-semibold">Reportes y documentos</summary><div className="mt-3 flex flex-wrap gap-2">{[['/reportes','Reportes'],['/boleta','Boletas'],['/seguros','Reembolsos']].map(([href,n])=><Link key={href} href={href} className="rounded-xl border px-4 py-3">{n}</Link>)}</div></details>
      </>}
    </>}
  </div>;
}
