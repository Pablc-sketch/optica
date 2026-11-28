import CabeceraPagina from "@/components/cabecera-pagina";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { exigirRolPagina } from '@/lib/autorizacion';
import { cargarPendientes } from '@/lib/resumen-pendientes';
import { leerTodas } from '@/lib/leer-todas';
import { clp } from '@/lib/clp';
import { hoyEnChile, fechaLegible } from '@/lib/fechas';
import {etiquetasReparto} from '@/lib/etiquetas-reparto';
import { pendientePersonal } from '@/lib/caja-fuentes';
import {leerEstadoCuenta} from '@/lib/cuenta-mercadopago';
import { efectivoDesdeConteo, prioridadCaja } from '@/lib/caja-verificada';
import { resumenSedeCaja, sedesDeCaja } from '@/lib/caja-operativo';
import type { VentaParaCierre } from '@/lib/cierre-operativo';
import ActualizarCajaMercadoPago from '@/components/actualizar-caja-mercadopago';
import CuentaBancaria from '@/components/cuenta-bancaria';
import ResumenCajaOperativo from '@/components/resumen-caja-operativo';
import CajaFormulario from '@/components/caja-formulario';
import { pagosConAsignaciones, type PagoCosto } from '@/lib/pagos-operativo';
import { resumirCaja } from '@/lib/caja';
import CajaDelChequeo from '@/components/caja-del-chequeo';
import VistaGastos, { type FiltrosGastos } from '@/components/vista-gastos';
import { buscarAmbitoReparto, cargarCajaChequeo, COLUMNAS_CHEQUEO } from '@/lib/datos-caja-chequeo';
import { saldosReparto } from '@/lib/datos-reparto-disponible';
import type { Chequeo } from '@/lib/chequeos';
import CajaHistorial from '@/components/caja-historial';
import SueldosGlobales from '@/components/sueldos-globales';
export const dynamic = 'force-dynamic';
const campo = 'w-full min-w-0 rounded-xl border px-3 py-2.5';
const vistas = [['resumen', 'Resumen'], ['sueldos', 'Sueldos globales'], ['gastos', 'Gastos'], ['movimientos', 'Movimientos'], ['pendientes', 'Pendientes'], ['cuadrar', 'Cuadrar']] as const;
export default async function Caja({ searchParams }: {
  searchParams: Promise<FiltrosGastos & { chequeo?: string; ver?: string; mes?: string; operativo?: string; sede?: string | string[] }>;
}) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const piloto = esPilotoTerreno(tenantId);
  const params = await searchParams;
  const vista = vistas.find(([clave]) => clave === params.ver)?.[0] ?? 'resumen';
  const navegacion = <nav aria-label="Finanzas" className="grid grid-cols-2 gap-2 sm:grid-cols-6">{vistas.map(([clave,nombre]) => <Link key={clave} href={clave === 'resumen' ? '/caja' : `/caja?ver=${clave}`} aria-current={vista===clave?'page':undefined} className={`rounded-xl px-3 py-2.5 text-center text-sm font-semibold ${vista===clave?'bg-sidebar-active text-white':'bg-white shadow-sm hover:bg-sky-50'}`}>{nombre}</Link>)}</nav>;
  const guardado = params.guardado === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro guardado.</p>;

  if (vista === 'sueldos') return <div className="mx-auto max-w-6xl space-y-4 pb-6">
    <CabeceraPagina seccion="Operación" titulo="Caja y gastos" />
    {navegacion}
    <SueldosGlobales supabase={supabase} tenantId={tenantId} mes={params.mes} />
  </div>;

  if (vista === 'gastos') return <div className="mx-auto max-w-6xl space-y-4 pb-6">
    <CabeceraPagina seccion="Operación" titulo="Caja y gastos" />
    {navegacion}
    <VistaGastos filtros={params} />
  </div>;

  if (vista === 'resumen' && params.sede === undefined) {
    const hoy = hoyEnChile();
    const grupos = await leerTodas((a, b) => supabase.from('chequeos')
      .select(COLUMNAS_CHEQUEO)
      .eq('tenant_id', tenantId).order('desde', { ascending: false }).order('id').range(a, b));
    const chequeos = (grupos.data ?? []) as Chequeo[];
    const preferido = chequeos.find(c => c.id === params.chequeo)
      ?? chequeos.find(c => c.desde <= hoy && hoy <= c.hasta)
      ?? chequeos.find(c => c.desde <= hoy);
    if (grupos.error) return <div className="space-y-4">
      <CabeceraPagina seccion="Operación" titulo="Caja y gastos" />{navegacion}
      <p role="alert" className="rounded-xl bg-red-50 p-4">No se pudieron cargar los chequeos de la caja.</p>
    </div>;
    if (params.operativo || preferido) {
      const versionInicial = await supabase.rpc('version_caja_reparto');
      const ambito = await buscarAmbitoReparto(supabase, tenantId,
        params.operativo ? { operativo: params.operativo } : { chequeo: preferido?.id });
      const datos = ambito && await cargarCajaChequeo(supabase, tenantId, ambito.chequeo, ambito.sedes, hoy);
      const saldos = datos && await saldosReparto(supabase, tenantId, hoy, datos.tenant);
      const versionFinal = await supabase.rpc('version_caja_reparto');
      const version = !versionInicial.error && !versionFinal.error && versionInicial.data === versionFinal.data
        ? versionFinal.data as string | null : null;
      return <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-6">
        <CabeceraPagina seccion="Operación" titulo="Caja y gastos" acciones={<ActualizarCajaMercadoPago compacto />} />
        {navegacion}
        {guardado}
        {ambito && datos && saldos
          ? <CajaDelChequeo chequeo={ambito.chequeo} opciones={chequeos} sedes={ambito.sedes} datos={datos}
            hoy={hoy} saldos={saldos} version={version} abrirDetalle={params.guardado !== undefined} />
          : <p role="alert" className="rounded-xl bg-red-50 p-4">No se pudo calcular el reparto. Recarga para reintentar.</p>}
      </div>;
    }
  }

  if (vista === 'resumen') {
    const hoy = hoyEnChile();
    const [operativos, cuenta, caja, conteo, tenant] = await Promise.all([
      leerTodas((a, b) => supabase.from('operativos').select('id,nombre,fecha,fecha_fin,hora_inicio,estado,archivado_en,pagos_saldados_en,costo_fides_real,costo_marco_unitario,costo_transporte,costo_arriendo,costo_viaticos,costo_otros,costo_ayudante,costo_equipos,costo_hospedaje,costo_comida,costo_peajes,comision_vendedora_pct,comision_vendedora_base,ahorro_pct')
        .eq('tenant_id', tenantId).order('id').range(a, b)),
      leerEstadoCuenta(tenantId),
      supabase.rpc('caja_global').single(),
      supabase.from('caja_conteos').select('contado,esperado').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(1),
      supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id', tenantId).single(),
    ]);
    const sedes = (operativos.data ?? []).filter(o => o.fecha <= hoy && o.estado !== 'cancelado');
    const seleccion = sedesDeCaja(sedes, hoy, params.sede);
    const grupos = [];
    for (let i = 0; i < seleccion.length; i += 50) grupos.push(seleccion.slice(i, i + 50).map(s => s.id));
    const datosPorGrupo = await Promise.all(grupos.map(ids => Promise.all([
      leerTodas((a, b) => supabase.from('ventas').select(
        `id,operativo_id,total,pagos_abonos(monto,medio_pago),
        venta_items(cantidad,precio_unitario,descuento,descripcion,cristal_slot,
          ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2),
          productos:producto_id(costo,categoria))`)
        .eq('tenant_id', tenantId).eq('anulada', false).in('operativo_id', ids).order('id').range(a, b)),
      leerTodas((a, b) => supabase.from('gastos_globales').select('id,operativo_id,descripcion,monto')
        .eq('tenant_id', tenantId).in('operativo_id', ids).order('id').range(a, b)),
      leerTodas((a, b) => supabase.from('gastos_asignaciones').select('id,gasto_id,operativo_id,clave,monto,anulado_en')
        .eq('tenant_id', tenantId).in('operativo_id', ids).is('anulado_en', null).order('id').range(a, b)),
    ])));
    const porSede = new Map<string, VentaParaCierre[]>();
    for (const venta of datosPorGrupo.flatMap(([ventas]) => ventas.data ?? [])) {
      if (!venta.operativo_id) continue;
      const lista = porSede.get(venta.operativo_id) ?? [];
      lista.push(venta as unknown as VentaParaCierre);
      porSede.set(venta.operativo_id, lista);
    }
    const costosPorSede = new Map<string, PagoCosto[]>();
    for (const gasto of datosPorGrupo.flatMap(([, gastos]) => gastos.data ?? [])) {
      if (!gasto.operativo_id) continue;
      const lista = costosPorSede.get(gasto.operativo_id) ?? [];
      lista.push(gasto);
      costosPorSede.set(gasto.operativo_id, lista);
    }
    const asignaciones = datosPorGrupo.flatMap(([, , res]) => res.data ?? []);
    const errorPagos = datosPorGrupo.some(([, gastos, vinculos]) => gastos.error || vinculos.error);
    const filas = seleccion.map(s => resumenSedeCaja(s, porSede.get(s.id) ?? [],
      Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0),
      pagosConAsignaciones(costosPorSede.get(s.id) ?? [], asignaciones, s.id)));
    const totales = caja.data as { entro_efectivo: number; salio_efectivo: number } | null;
    const efectivo = totales && !caja.error && !conteo.error
      ? efectivoDesdeConteo(totales.entro_efectivo - totales.salio_efectivo, conteo.data?.[0]) : null;
    return <div className="mx-auto flex max-w-5xl flex-col gap-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CabeceraPagina seccion="Operación" titulo="Caja" />
        <div className="flex flex-wrap gap-2">
          <Link href="/operativos/chequeos" className="rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white">Chequeos</Link>
          <ActualizarCajaMercadoPago compacto />
        </div>
      </div>
      {navegacion}
      {guardado}
      <ResumenCajaOperativo sedes={sedes.sort((a, b) => b.fecha.localeCompare(a.fecha))} seleccion={seleccion} filas={filas}
        saldo={cuenta.saldo} efectivo={efectivo} hoy={hoy} errorPagos={errorPagos}
        error={Boolean(operativos.error || tenant.error || datosPorGrupo.some(([ventas]) => ventas.error))} />
    </div>;
  }

  const [caja, pendientes, gastos, movimientos, conteos, cobros, retiros, tenant, ventas, operativos] = await Promise.all([
    supabase.rpc('caja_global').single(), cargarPendientes(supabase),
    leerTodas((a,b) => supabase.from('gastos_globales').select('id,fecha,descripcion,monto,caja,operativo_id,monto_estimado').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('caja_movimientos').select('id,fecha,tipo,monto,caja,gasto_id,descripcion,created_at').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('caja_conteos').select('contado,esperado,nota,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(5),
    leerTodas((a,b) => supabase.from('pagos_abonos').select('id,fecha,monto,medio_pago,venta_id,ventas!inner(anulada)').eq('tenant_id',tenantId).eq('ventas.anulada',false).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('retiros_sueldo').select('id,fecha,monto,caja,persona,operativo_id').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct,reparto_etiquetas').eq('id',tenantId).single(),
    leerTodas((a,b) => supabase.from('ventas').select('id,total,operativo_id,pagos_abonos(monto)').eq('tenant_id',tenantId).eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('operativos').select('id,nombre,fecha').eq('tenant_id',tenantId).order('id').range(a,b)),
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
  const cuentaProveedor = vista === "cuadrar" ? await leerEstadoCuenta(tenantId) : undefined;
  const efectivoVerificado=efectivoDesdeConteo(efectivo,ultimoConteo);
  const banco = cuentaProveedor?.saldo;
  const prioridad = prioridadCaja(efectivoVerificado, banco?.estado === "disponible" ? banco.disponible : null, deudaPersonal);
  const base = pendientes.resumen;
  const p = { ...base, total: base.costos + (pendientes.impuestosPendientes ?? 0) };

  const operativoId = (vista==='movimientos'||vista==='pendientes') && (operativos.data ?? []).some(o => o.id === params.operativo) ? params.operativo! : '';
  const ventasFiltradas = (ventas.data ?? []).filter(v => !operativoId || v.operativo_id === operativoId);
  const operativoPorVenta = new Map((ventas.data ?? []).map(v => [v.id,v.operativo_id]));
  const porCobrar = ventasFiltradas.reduce((s,v) => s + Math.max(0, v.total - v.pagos_abonos.reduce((s,p) => s+p.monto,0)),0);
  const pendientesFiltrados = p.operativos.filter(o => !operativoId || o.operativoId === operativoId);
  const fecha = hoyEnChile();
  const nombres=etiquetasReparto(tenant.data?.reparto_etiquetas);
  const filas = [['Laboratorio',p.fides],['Marcos / armazones',p.marcos],['Gastos de operativos',p.gastos],['SII declarado por pagar',pendientes.impuestosPendientes??0]] as const;
  return <div className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><CabeceraPagina seccion="Operación" titulo="Caja" /><div className="flex flex-wrap items-center gap-3">{vista === "cuadrar" && <ActualizarCajaMercadoPago compacto />}<Link href="/impuestos" className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold">SII mensual</Link></div></div>
    {navegacion}
    {(vista==='movimientos'||vista==='pendientes') && <form action="/caja" className="flex flex-wrap items-end gap-2"><input type="hidden" name="ver" value={vista} /><label className="min-w-0 flex-1 text-sm">Operativo<select name="operativo" defaultValue={operativoId} className={campo}><option value="">Todos los operativos</option>{[...(operativos.data ?? [])].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(o=><option key={o.id} value={o.id}>{o.nombre} · {fechaLegible(o.fecha)}</option>)}</select></label><button className="rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Ver</button></form>}
    {guardado}

    {error ? <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">No se pudo leer toda la caja. Recarga antes de registrar movimientos.</p> : <>
      {vista==='pendientes' && <>
      <div className="grid grid-cols-2 gap-3"><Link href="/cobros" className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-sm">Clientes por cobrar</p><b className="text-2xl tabular-nums">{clp(porCobrar)}</b><p className="mt-2 text-sm underline">Gestionar cobros →</p></Link><Link href={piloto ? "/reportes" : "/pagos/revisar"} className="rounded-2xl bg-tinta p-4 font-semibold text-white">Confirmar o corregir pagos, gastos y ahorro →</Link></div>
      <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Por operativo</h2>
      {pendientesFiltrados.length===0 && <p className="mt-3 text-sm">Sin pagos ni ahorro pendientes.</p>}
      {pendientesFiltrados.map(o=><Link key={o.operativoId} href={`/operativos/${o.operativoId}/cierre`} className="mt-3 block rounded-xl border p-3"><b>{o.nombre}</b><p className="text-xs text-tinta-suave">{fechaLegible(o.fecha)}</p><dl className="mt-2 grid grid-cols-2 gap-2 text-sm">{[['Laboratorio',o.fides],['Marcos',o.marcos],['Gastos',o.gastos]].map(([n,m])=><div key={n} className="flex justify-between gap-2"><dt>{n}</dt><dd className="tabular-nums">{clp(Number(m))}</dd></div>)}</dl></Link>)}
      </section>
      <div className="flex flex-wrap gap-4 px-1 text-sm">
        <Link href={piloto ? "/reportes" : "/pagos/revisar"} className="underline">Ahorro registrado · {clp((retiros.data ?? []).filter(r => r.persona === 'ahorro').reduce((s, r) => s + r.monto, 0))}</Link>
        <Link href="/reportes" className="underline">Reportes</Link>
      </div>
      <details className="rounded-2xl bg-white p-4 shadow-sm"><summary className="cursor-pointer font-bold text-red-700">Costos y obligaciones de la óptica · {clp(p.total+deudaPersonal)}</summary>
      <div className="pt-2">
        <dl className="mt-2 divide-y divide-tinta/10">{filas.filter(([,monto])=>monto>0).map(([nombre,monto]) => <div key={nombre} className="flex justify-between gap-3 py-2"><dt>{nombre}</dt><dd className="font-semibold tabular-nums">{clp(monto)}</dd></div>)}
          <div className="flex justify-between gap-3 py-2"><dt>{piloto ? 'Gastos por reembolsar' : `Devolver a ${nombres.pablo} · gastos personales`}</dt><dd className="font-semibold tabular-nums">{clp(deudaPersonal)}</dd></div>
          <div className="flex justify-between gap-3 py-3 font-bold"><dt>Total pendiente</dt><dd>{clp(p.total+deudaPersonal)}</dd></div>
        </dl><p className="text-xs text-tinta-suave">Costos registrados. Consulta el reparto y el ahorro de cada chequeo en Resumen.</p>
        <Link href="/caja#reparto" className="mt-2 block text-sm font-semibold underline">Ver reparto y ahorro</Link>
        <Link href={piloto ? "/agenda/equipos" : "/pagos"} className="mt-3 inline-block rounded-xl border px-3 py-2 font-semibold">Ver y registrar pagos →</Link>
      </div>
      </details>
      </>}
      {vista==='movimientos' && <>
      <section id="nuevo-gasto" className="scroll-mt-6 rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold text-red-700">Gastos</h2>
        <Link href="/caja?ver=gastos&detalle=registrar" className="mt-2 inline-block py-2 text-sm font-semibold underline">Registrar gasto</Link>
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
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">Cuadrar efectivo</h2><p className="mt-2 text-sm">Efectivo desde último conteo</p><p className="text-3xl font-bold tabular-nums">{efectivoVerificado===null?'Por contar':clp(efectivoVerificado)}</p><details className="mt-3 text-sm"><summary>Comparar con el libro histórico</summary><p className="mt-2">Saldo registrado: {clp(efectivo)}. La diferencia se conserva para revisar, sin inventar un gasto ni borrar movimientos.</p></details>
      {ultimoConteo && <p className="mt-3 text-sm">Último conteo: {clp(ultimoConteo.contado)} · diferencia entonces: {clp(ultimoConteo.contado-ultimoConteo.esperado)} · {new Date(ultimoConteo.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</p>}
        <details className="mt-4"><summary className="cursor-pointer rounded-xl border px-3 py-3 font-semibold">Contar efectivo</summary><p className="my-3 text-sm text-tinta-suave">Anota lo que tienes físicamente. Si hay diferencia, revisa los movimientos.</p>
          <CajaFormulario texto="Guardar conteo"><input type="hidden" name="id" value={randomUUID()} /><input type="hidden" name="tipo" value="conteo" />
            <label className="text-sm">Dinero contado<input name="monto" type="number" min="0" step="1" required className={campo} /></label><label className="text-sm">Nota<input name="descripcion" maxLength={250} className={campo} /></label>
          </CajaFormulario>
        </details>
      </section>
      <CuentaBancaria enlaceExterno={false} tenantId={tenantId} cuenta={cuentaProveedor} registrado={{saldo:saldo.hayDigital,maquina:(t?.entro_debito ?? 0)+(t?.entro_credito ?? 0),transferencias:(t?.entro_digital ?? 0)-(t?.entro_debito ?? 0)-(t?.entro_credito ?? 0),salidas:saldo.salioDigital,comisiones:saldo.comisionTarjeta}} />
      <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-semibold">Saldo tras costos registrados</summary>
        <p className="mt-3 text-2xl font-bold tabular-nums">{deudaPersonal > 0 ? clp(0) : prioridad.paraRepartir === null ? 'Por verificar' : clp(Math.max(0, prioridad.paraRepartir - p.total))}</p>
        <p className="mt-2 text-sm text-tinta-suave">{deudaPersonal > 0 ? 'Primero se devuelve el dinero personal.' : 'Saldo verificado menos costos registrados. El disponible para socios y ahorro está en el reparto de cada chequeo.'}</p>
      </details>
      <Link href="/caja?ver=movimientos" className="rounded-xl bg-white p-4 text-center font-semibold">Revisar movimientos y diferencias →</Link>
      <Link href="/caja?ver=gastos&personal=1#adelantos-personales" className="block rounded-2xl border border-tinta/20 bg-white p-5 text-base font-semibold">Gastos personales y devoluciones →</Link>
      </>}
    </>}
  </div>;
}
