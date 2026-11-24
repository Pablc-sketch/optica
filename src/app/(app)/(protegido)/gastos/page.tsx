import Link from 'next/link';
import GastosPanel from '@/components/gastos-panel';
import GastosPersonales from '@/components/gastos-personales';
import { GastoGeneralForm, GastoOperativoForm } from '@/components/registro-gasto';
import SimuladorSalida from '@/components/simulador-salida';
import { exigirRolPagina } from '@/lib/autorizacion';
import { pendientePersonal } from '@/lib/caja-fuentes';
import { cargarCatalogoParaCotizar } from '@/lib/catalogo-laboratorio';
import { numerosDeOperativo, type VentaParaCierre } from '@/lib/cierre-operativo';
import { clp } from '@/lib/clp';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import { fechaLegible, hoyEnChile } from '@/lib/fechas';
import { leerTodas } from '@/lib/leer-todas';
import { COSTOS, conceptoDeGasto, costosDeSede, disponibleDeGasto, esPagoDeCosto, pagosConAsignaciones, saldoCostos } from '@/lib/pagos-operativo';
import { costoRealCristal, precioVentaCristal } from '@/lib/precio-venta';
import { comisionHistorica } from '@/lib/rentabilidad-precios';

const vistas = [
  ['pendientes', 'Pendientes'],
  ['historial', 'Historial'],
  ['rentabilidad', 'Rentabilidad'],
] as const;
type Vista = (typeof vistas)[number][0] | 'registrar';
const campo = 'mt-1 block w-full rounded-xl border border-tinta/20 px-3 py-2.5';
const origenGasto: Record<string, string> = { digital: 'Cuenta de la óptica', efectivo: 'Efectivo', personal: 'Dinero personal' };
const porPagina = 25;

export default async function Gastos({ searchParams }: {
  searchParams: Promise<{ op?: string | string[]; desde?: string; hasta?: string; ver?: string; guardado?: string; personal?: string; pagina?: string }>;
}) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const filtros = await searchParams;
  const vista = vistas.find(([id]) => id === filtros.ver)?.[0] ?? (filtros.ver === 'registrar' ? 'registrar' : 'pendientes');
  const hoy = hoyEnChile();
  const idsFiltro = new Set((Array.isArray(filtros.op) ? filtros.op : [filtros.op]).filter(Boolean).slice(0, 100));
  const desde = fechaValidaDocumento(filtros.desde ?? '') ? filtros.desde! : '';
  const hasta = fechaValidaDocumento(filtros.hasta ?? '') ? filtros.hasta! : '';
  const dentroFecha = (fecha: string) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta);
  const filtroActivo = Boolean(idsFiltro.size || desde || hasta);

  const consulta = new URLSearchParams();
  for (const op of idsFiltro) if (op) consulta.append('op', op);
  if (desde) consulta.set('desde', desde);
  if (hasta) consulta.set('hasta', hasta);
  function enlace(destino: Vista, pagina = 1) {
    const params = new URLSearchParams(consulta);
    if (destino !== 'pendientes') params.set('ver', destino);
    if (pagina > 1) params.set('pagina', String(pagina));
    return params.size ? `/gastos?${params}` : '/gastos';
  }

  const cabecera = <header className="flex flex-wrap items-center justify-between gap-3">
    <h1 className="text-3xl font-bold">Gastos</h1>
    {vista !== 'registrar' && <Link href={enlace('registrar')} className="rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">Registrar gasto</Link>}
  </header>;
  const navegacion = <nav aria-label="Gastos" className="grid grid-cols-3 gap-1 rounded-2xl border border-tinta/10 bg-white p-1 sm:inline-grid">
    {vistas.map(([id, titulo]) => <Link key={id} href={enlace(id)} aria-current={vista === id ? 'page' : undefined}
      className={`rounded-xl px-2 py-3 text-center text-sm font-semibold sm:px-5 ${vista === id ? 'bg-tinta text-white' : 'text-tinta-suave hover:bg-crema'}`}>{titulo}</Link>)}
  </nav>;
  const guardado = filtros.guardado === '1' && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Gasto actualizado.</p>;

  const operativos = await leerTodas((a, b) => supabase.from('operativos').select('*').eq('tenant_id', tenantId).order('id').range(a, b));
  if (operativos.error) return <p role="alert" className="rounded-xl bg-red-50 p-5">No se pudieron cargar las sedes. Recarga para reintentar.</p>;
  const sedes = [...(operativos.data ?? [])].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre));
  const sedePorId = new Map(sedes.map(sede => [sede.id, sede.nombre]));

  if (vista === 'registrar') {
    const elegibles = sedes.filter(s => s.estado !== 'cancelado' && s.fecha <= hoy);
    const seleccionadas = elegibles.filter(s => idsFiltro.has(s.id));
    const sedeInicial = seleccionadas.length === 1 ? seleccionadas[0].id : undefined;
    return <div className="mx-auto max-w-6xl space-y-5 pb-8">
      {cabecera}
      {navegacion}
      <div className="max-w-xl space-y-3">
        {elegibles.length > 0 && <details open={seleccionadas.length > 0} className="rounded-2xl border border-tinta/10 bg-white px-4 shadow-sm">
          <summary className="cursor-pointer py-3 font-semibold">Gasto de una sede</summary>
          <div className="pb-4"><GastoOperativoForm sedes={elegibles} sedeInicial={sedeInicial} hoy={hoy} desdeGastos /></div>
        </details>}
        <details open={seleccionadas.length === 0} className="rounded-2xl border border-tinta/10 bg-white px-4 shadow-sm">
          <summary className="cursor-pointer py-3 font-semibold">Gasto general de la óptica</summary>
          <div className="pb-4"><GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" /></div>
        </details>
      </div>
    </div>;
  }

  const barraFiltros = <details className="rounded-2xl border border-tinta/10 bg-white px-4">
    <summary className="cursor-pointer py-3 text-sm font-semibold">
      {idsFiltro.size > 0 ? idsFiltro.size === 1 ? sedePorId.get([...idsFiltro][0]!) ?? 'Sede seleccionada' : `${idsFiltro.size} sedes seleccionadas` : 'Filtrar por sede o fechas'}
      {desde && <span className="ml-2 text-xs font-normal text-tinta-suave">Desde {fechaLegible(desde)}</span>}
      {hasta && <span className="ml-2 text-xs font-normal text-tinta-suave">Hasta {fechaLegible(hasta)}</span>}
    </summary>
    <form action="/gastos" className="grid items-end gap-3 pb-4 sm:grid-cols-[2fr_1fr_1fr_auto]">
      <input type="hidden" name="ver" value={vista} />
      <fieldset className="min-w-0">
        <legend className="text-sm">Sedes</legend>
        <div className="mt-1 max-h-28 space-y-1 overflow-auto rounded-xl border border-tinta/20 p-2">
          {sedes.map(sede => <label key={sede.id} className="flex items-start gap-2 text-sm">
            <input className="mt-1" type="checkbox" name="op" value={sede.id} defaultChecked={idsFiltro.has(sede.id)} />
            {sede.nombre} · {fechaLegible(sede.fecha)}
          </label>)}
          {sedes.length === 0 && <p className="text-sm text-tinta-suave">Sin sedes registradas.</p>}
        </div>
      </fieldset>
      <label className="min-w-0 text-sm">Desde<input name="desde" type="date" defaultValue={desde} className={campo} /></label>
      <label className="min-w-0 text-sm">Hasta<input name="hasta" type="date" defaultValue={hasta} min={desde || undefined} className={campo} /></label>
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <button className="rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">Aplicar</button>
        {filtroActivo && <Link href={vista === 'pendientes' ? '/gastos' : `/gastos?ver=${vista}`} className="py-2 text-sm underline">Limpiar</Link>}
      </div>
    </form>
  </details>;
  const encabezado = <>{cabecera}{navegacion}{guardado}{barraFiltros}
    {desde && hasta && desde > hasta && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">La fecha de inicio debe ser anterior a la de término.</p>}
  </>;

  const consultarGastos = () => leerTodas((a, b) => supabase.from('gastos_globales')
    .select('id,operativo_id,fecha,descripcion,monto,categoria,caja,nota,monto_estimado')
    .eq('tenant_id', tenantId).order('id').range(a, b));

  if (vista === 'historial') {
    const resultado = await consultarGastos();
    if (resultado.error) return <div className="mx-auto max-w-6xl space-y-5">{encabezado}<p role="alert" className="rounded-xl bg-red-50 p-5">No se pudo cargar el historial.</p></div>;
    const movimientos = (resultado.data ?? []).filter(g => dentroFecha(g.fecha) && (!idsFiltro.size || (g.operativo_id && idsFiltro.has(g.operativo_id))))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.descripcion.localeCompare(b.descripcion));
    const paginas = Math.max(1, Math.ceil(movimientos.length / porPagina));
    const pagina = Math.min(paginas, Math.max(1, Number.parseInt(filtros.pagina ?? '', 10) || 1));
    return <div className="mx-auto max-w-6xl space-y-5 pb-8">
      {encabezado}
      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-bold">Gastos registrados</h2>
        {!movimientos.length && <p className="mt-2 text-sm text-tinta-suave">Sin gastos en esta selección.</p>}
        <ul className="mt-2 divide-y divide-tinta/10">
          {movimientos.slice((pagina - 1) * porPagina, pagina * porPagina).map(g => <li key={g.id} className="flex justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="break-words font-semibold">{conceptoDeGasto(g.descripcion)}</p>
              <p className="mt-1 text-sm text-tinta-suave">{fechaLegible(g.fecha)} · {g.operativo_id ? sedePorId.get(g.operativo_id) ?? 'Sede' : 'General'} · {origenGasto[g.caja] ?? g.caja}</p>
              {g.nota && <p className="mt-1 break-words text-sm text-tinta-suave">{g.nota}</p>}
            </div>
            <strong className="shrink-0 tabular-nums">{clp(g.monto)}</strong>
          </li>)}
        </ul>
        {paginas > 1 && <nav aria-label="Páginas del historial" className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-tinta/10 pt-3 text-sm">
          {pagina > 1 ? <Link className="py-2 font-semibold underline" href={enlace('historial', pagina - 1)}>Anterior</Link> : <span />}
          <span>{pagina} de {paginas}</span>
          {pagina < paginas ? <Link className="py-2 font-semibold underline" href={enlace('historial', pagina + 1)}>Siguiente</Link> : <span />}
        </nav>}
        <Link href="/pagos/revisar" className="mt-3 inline-block py-2 text-sm font-semibold underline">Corregir un pago</Link>
      </section>
    </div>;
  }

  const [ventas, gastos, asignaciones, tenant, recetas, impuestosPagos, devoluciones] = await Promise.all([
    leerTodas((a, b) => supabase.from('ventas').select('id,operativo_id,total,pagos_abonos(monto,medio_pago),venta_items(cantidad,precio_unitario,descuento,descripcion,cristal_slot,ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2),productos:producto_id(costo,categoria))')
      .eq('tenant_id', tenantId).eq('anulada', false).order('id').range(a, b)),
    consultarGastos(),
    leerTodas((a, b) => supabase.from('gastos_asignaciones').select('id,gasto_id,operativo_id,clave,monto,anulado_en').eq('tenant_id', tenantId).order('id').range(a, b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id', tenantId).single(),
    leerTodas((a, b) => supabase.from('recetas').select('id,paciente_id,operativo_id').eq('tenant_id', tenantId).order('id').range(a, b)),
    leerTodas((a, b) => supabase.from('impuestos_pagos').select('gasto_id').is('anulado_en', null).order('id').range(a, b)),
    leerTodas((a, b) => supabase.from('caja_movimientos').select('id,gasto_id,monto').eq('tenant_id', tenantId).eq('tipo', 'devolucion').order('id').range(a, b)),
  ]);
  if (ventas.error || gastos.error || asignaciones.error || tenant.error || recetas.error || impuestosPagos.error || devoluciones.error) {
    return <div className="mx-auto max-w-6xl space-y-5">{encabezado}<p role="alert" className="rounded-xl bg-red-50 p-5">No se pudieron cargar todos los gastos. Recarga antes de registrar pagos.</p></div>;
  }

  const lista = sedes.filter(s => (!idsFiltro.size || idsFiltro.has(s.id)) && dentroFecha(s.fecha));
  const ids = new Set(lista.map(s => s.id));
  const debito = Number(tenant.data?.comision_debito_pct ?? 0);
  const credito = Number(tenant.data?.comision_credito_pct ?? 0);
  const ventasValidas = ventas.data ?? [];
  const gastosValidos = gastos.data ?? [];
  const vinculos = asignaciones.data ?? [];
  const filas = lista.map(sede => {
    const n = numerosDeOperativo(sede, ventasValidas.filter(v => v.operativo_id === sede.id) as unknown as VentaParaCierre[], debito, credito);
    const pagos = pagosConAsignaciones(gastosValidos.filter(g => g.operativo_id === sede.id), vinculos, sede.id);
    const atendidos = new Set((recetas.data ?? []).filter(r => r.operativo_id === sede.id).map(r => r.paciente_id)).size;
    return {
      id: sede.id, nombre: sede.nombre, fecha: sede.fecha, vendido: n.vendido, cobrado: n.cobrado, utilidad: n.cierre.gananciaLiquida,
      costo: n.cierre.gastoTotal, atendidos, pares: n.desglose.marcos, costoFidesActual: sede.costo_fides_real,
      costos: costosDeSede(sede, n.desglose, pagos), costoMarco: sede.costo_marco_unitario,
      importes: Object.fromEntries(COSTOS.map(c => [c.clave, Number(sede[c.clave] ?? 0)])),
    };
  });
  const personales = gastosValidos.filter(g => g.caja === 'personal').map(g => ({
    ...g, pendiente: pendientePersonal(g.monto, (devoluciones.data ?? []).filter(d => d.gasto_id === g.id)),
  })).filter(g => g.pendiente > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const gastosSii = (impuestosPagos.data ?? []).map(p => p.gasto_id);
  const generales = gastosValidos.filter(g => !esPagoDeCosto(g.descripcion)
    && (g.operativo_id ? ids.has(g.operativo_id) : !idsFiltro.size && dentroFecha(g.fecha)));
  const overhead = generales.filter(g => !gastosSii.includes(g.id) && !g.descripcion.startsWith('SII F29 · ') && g.categoria !== 'compra_inventario')
    .reduce((suma, gasto) => suma + disponibleDeGasto(gasto, vinculos), 0);
  const utilidad = filas.reduce((suma, fila) => suma + fila.utilidad, 0) - overhead;
  const vendido = filas.reduce((suma, fila) => suma + fila.vendido, 0);
  const costosTotales = filas.reduce((suma, fila) => suma + fila.costo, 0) + overhead;
  const pendiente = filas.reduce((suma, fila) => suma + saldoCostos(fila.costos), 0);
  const margen = vendido > 0 ? `${(utilidad / vendido * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : 'sin ventas';

  const cotizar = vista === 'rentabilidad' ? await cargarCatalogoParaCotizar(supabase) : null;
  const perfiles = cotizar ? cotizar.filas.filter(f => f.rango_receta === '±2.00 / ±2.00').flatMap(f => {
    const costo = costoRealCristal(f, null, 'lejos', cotizar.catalogo, hoy);
    return costo ? [{ id: `${f.tipo_lente}|${f.tratamiento}`, nombre: `${f.tipo_lente} · ${f.tratamiento}`, precio: precioVentaCristal(f, costo.origen), costo: costo.costo, origen: costo.origen }] : [];
  }) : [];
  const comisiones = lista.map(s => Number(s.comision_vendedora_pct ?? 10));
  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    {encabezado}
    {vista === 'pendientes' && <>
      <GastosPanel key={consulta.toString()} filas={filas} gastos={gastosValidos} asignaciones={vinculos} hoy={hoy} gastosSii={gastosSii} />
      {personales.length > 0 && <details id="adelantos-personales" open={filtros.personal === '1' || filtros.guardado === '1'}
        className="scroll-mt-6 rounded-2xl border border-tinta/10 bg-white px-4">
        <summary className="cursor-pointer py-3 font-semibold">Dinero personal por devolver · {clp(personales.reduce((suma, gasto) => suma + gasto.pendiente, 0))}</summary>
        <div className="pb-4"><GastosPersonales gastos={personales} hoy={hoy} /></div>
      </details>}
    </>}
    <details open={vista === 'rentabilidad'} className="rounded-2xl border border-tinta/10 bg-white px-4">
      <summary className="cursor-pointer py-3 font-semibold">Resultado de las sedes</summary>
      <section className="grid gap-2 sm:grid-cols-3" aria-label="Resumen de gastos">
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Costos totales</h2><b className="block text-lg tabular-nums">{clp(costosTotales)}</b><p className="text-sm text-tinta-suave">Ventas por {clp(vendido)}</p></div>
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Costos por pagar</h2><b className="block text-lg tabular-nums">{clp(pendiente)}</b></div>
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Ganancia operativa</h2><b className={`block text-lg tabular-nums ${utilidad < 0 ? 'text-red-800' : 'text-accent-dark'}`}>{clp(utilidad)}</b><p className="text-sm text-tinta-suave">Margen {margen} · antes de IVA</p></div>
      </section>
      <p className="py-3 text-sm text-tinta-suave">Ventas menos costos y comisiones. Incluye ventas pendientes de cobro. La reposición de stock se descuenta al venderlo.</p>
    </details>
    {cotizar && <SimuladorSalida key={consulta.toString()} titulo="Simular ganancias" fijosRegistrados={filas.reduce((suma, fila) => suma + Object.values(fila.importes).reduce((a, b) => a + b, 0), 0) + overhead}
      perfiles={perfiles} recargosMarcos={cotizar.recargosMarcos} debito={debito} credito={credito} historica={comisionHistorica(ventasValidas.flatMap(v => v.pagos_abonos ?? []), debito, credito)}
      comisionVenta={comisiones.length ? Math.max(...comisiones) : 10} />}
  </div>;
}
