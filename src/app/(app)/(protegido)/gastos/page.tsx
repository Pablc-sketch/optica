import { randomUUID } from 'node:crypto';
import BotonEnviar from '@/components/boton-enviar';
import { ChequeoFinanciero } from '@/components/chequeo-financiero';
import type { MovimientoRevision } from '@/lib/revision-financiera';
import { crearGastoGlobal } from '@/lib/actions/gastos';
import { etiquetasReparto } from '@/lib/etiquetas-reparto';
import { esPilotoTerreno } from '@/lib/piloto-terreno';
import { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";
import { costoRealCristal, precioVentaCristal } from "@/lib/precio-venta";
import { comisionHistorica } from "@/lib/rentabilidad-precios";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { leerTodas } from '@/lib/leer-todas';
import { numerosDeOperativo, type VentaParaCierre } from '@/lib/cierre-operativo';
import { COSTOS, pagosConAsignaciones, pagadoCon, pendientesCostos, PREFIJO_FIDES, PREFIJO_MARCOS, esPagoDeCosto, disponibleDeGasto } from '@/lib/pagos-operativo';
import { hoyEnChile, fechaLegible } from '@/lib/fechas';
import { esOperativoArchivado } from '@/lib/agenda';
import { COSTO_MARCO_POR_PAR } from '@/lib/costo-venta';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import GastosPanel from '@/components/gastos-panel';
import SimuladorSalida from '@/components/simulador-salida';
import { clp } from '@/lib/clp';
import {pendientePersonal} from '@/lib/caja-fuentes';
import GastosPersonales from '@/components/gastos-personales';

const campo = 'w-full min-w-0 rounded-xl border px-3 py-2.5';

export default async function Gastos({searchParams}:{searchParams:Promise<{op?:string;desde?:string;hasta?:string;ver?:string;guardado?:string}>}) {
  const {supabase,tenantId}=await exigirRolPagina(['admin']);
  const filtros=await searchParams;
  const vista=filtros.ver==='historial'||filtros.ver==='rentabilidad'||filtros.ver==='registrar' ? filtros.ver : 'pendientes';
  const rentabilidad=vista==='rentabilidad';
  const hoy=hoyEnChile();
  const piloto=esPilotoTerreno(tenantId);
  const desde=fechaValidaDocumento(filtros.desde??'') ? filtros.desde! : '';
  const hasta=fechaValidaDocumento(filtros.hasta??'') ? filtros.hasta! : '';
  const [ops,ventas,gastos,asignaciones,tenant,impuestosPagos,devoluciones,auditoria]=await Promise.all([
    leerTodas((a,b)=>supabase.from('operativos').select('*').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('ventas').select(`id,operativo_id,total,pagos_abonos(monto,medio_pago),venta_items(cantidad,precio_unitario,descuento,descripcion,cristal_slot,ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2),productos:producto_id(costo,categoria))`).eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,operativo_id,fecha,descripcion,monto,categoria,caja,nota,monto_estimado,confirmado_en,revision_version').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_asignaciones').select('id,gasto_id,operativo_id,clave,monto,anulado_en').order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct,reparto_etiquetas').single(),
    leerTodas((a,b)=>supabase.from('impuestos_pagos').select('gasto_id').is('anulado_en',null).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('caja_movimientos').select('id,gasto_id,monto').eq('tenant_id',tenantId).eq('tipo','devolucion').order('id').range(a,b)),
    vista==='historial' ? supabase.from('revisiones_financieras').select('id,tabla,movimiento_id,antes,despues,motivo,created_at').eq('tenant_id',tenantId).eq('tabla','gastos_globales').order('created_at',{ascending:false}).limit(100) : {data:[],error:null},
  ]);
  if (ops.error||ventas.error||gastos.error||asignaciones.error||tenant.error||impuestosPagos.error||devoluciones.error||auditoria.error) return <p role="alert" className="rounded-xl bg-red-50 p-5">No se pudieron cargar todos los gastos. Recarga antes de registrar pagos.</p>;
  const personales=(gastos.data??[]).filter(g=>g.caja==='personal').map(g=>({...g,pendiente:pendientePersonal(g.monto,(devoluciones.data??[]).filter(d=>d.gasto_id===g.id))})).filter(g=>g.pendiente>0).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const lista=(ops.data??[]).filter(o=>(!filtros.op||o.id===filtros.op)&&(!desde||o.fecha>=desde)&&(!hasta||o.fecha<=hasta)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const ids=new Set(lista.map(o=>o.id));
  const filas=lista.map(o=>{
    const costoMarco=o.costo_marco_unitario ?? COSTO_MARCO_POR_PAR;
    const n=numerosDeOperativo(o,(ventas.data??[]).filter(v=>v.operativo_id===o.id) as unknown as VentaParaCierre[],Number(tenant.data?.comision_debito_pct??0),Number(tenant.data?.comision_credito_pct??0));
    const pagos=pagosConAsignaciones((gastos.data??[]).filter(g=>g.operativo_id===o.id),asignaciones.data??[],o.id);
    const costos=[{clave:'fides' as const,titulo:'Cristales (Fides)',total:n.desglose.totalCristales,pagado:pagadoCon(pagos,PREFIJO_FIDES)},
      {clave:'marcos' as const,titulo:'Marcos',total:n.desglose.totalArmazones,pagado:pagadoCon(pagos,PREFIJO_MARCOS)},...pendientesCostos(o,pagos)];
    return {id:o.id,nombre:o.nombre,fecha:o.fecha,archivado:esOperativoArchivado(o.estado),
      vendido:n.vendido,utilidad:n.cierre.gananciaLiquida,costo:n.cierre.gastoTotal,
      productos:n.desglose.total,terreno:n.gastos,comisiones:n.cierre.comisionTarjeta+n.cierre.isadora,
      pares:n.desglose.marcos,costoFidesActual:o.costo_fides_real,costoFidesNota:o.costo_fides_nota,costos,
      importes:Object.fromEntries(COSTOS.map(c=>[c.clave,Number(o[c.clave]??0)])),costoMarco};
  });
  const dentroFecha=(f:string)=>(!desde||f>=desde)&&(!hasta||f<=hasta);
  const generales=(gastos.data??[]).filter(g=>!esPagoDeCosto(g.descripcion)&&(!g.operativo_id? !filtros.op&&dentroFecha(g.fecha):ids.has(g.operativo_id)));
  const gastosSii=(impuestosPagos.data??[]).map(p=>p.gasto_id);
  const overhead=generales.filter(g=>!gastosSii.includes(g.id)&&!g.descripcion.startsWith('SII F29 · ')).filter(g=>g.categoria!=='compra_inventario').reduce((s,g)=>s+disponibleDeGasto(g,asignaciones.data??[]),0);
  const utilidad=filas.reduce((s,o)=>s+o.utilidad,0)-overhead;
  const cotizar=rentabilidad?await cargarCatalogoParaCotizar(supabase):null;
  const perfiles=cotizar?cotizar.filas.filter(f=>f.rango_receta==='±2.00 / ±2.00').flatMap(f=>{
    const costo=costoRealCristal(f,null,'lejos',cotizar.catalogo,hoyEnChile());
    return costo?[{id:`${f.tipo_lente}|${f.tratamiento}`,nombre:`${f.tipo_lente} · ${f.tratamiento}`,precio:precioVentaCristal(f,costo.origen),costo:costo.costo,origen:costo.origen}]:[];
  }):[];
  const debito=Number(tenant.data?.comision_debito_pct??0),credito=Number(tenant.data?.comision_credito_pct??0);
  const historica=comisionHistorica((ventas.data??[]).flatMap(v=>v.pagos_abonos??[]),debito,credito);
  const ventasSeleccionadas=lista.map(o=>Number(o.comision_vendedora_pct??10));
  const vendido=filas.reduce((s,o)=>s+o.vendido,0);
  const costosTotales=filas.reduce((s,o)=>s+o.costo,0)+overhead;
  const pendiente=filas.reduce((s,o)=>s+o.costos.reduce((t,c)=>t+Math.max(0,c.total-c.pagado),0),0);
  const margen=vendido>0?utilidad/vendido*100:null;
  const desgloseCostos = [
    ['Cristales, marcos y otros productos', filas.reduce((s,o)=>s+o.productos,0)],
    ['Gastos en terreno', filas.reduce((s,o)=>s+o.terreno,0)],
    ['Comisiones de venta y tarjeta', filas.reduce((s,o)=>s+o.comisiones,0)],
    ['Gastos generales sin asignar', overhead],
  ] as const;
  const consulta=new URLSearchParams();
  if(filtros.op)consulta.set('op',filtros.op);
  if(desde)consulta.set('desde',desde);
  if(hasta)consulta.set('hasta',hasta);
  const enlace=(destino:string)=>{
    const p=new URLSearchParams(consulta);
    if(destino!=='pendientes')p.set('ver',destino);
    return `/gastos${p.size?`?${p}`:''}`;
  };
  const nombres=etiquetasReparto(tenant.data?.reparto_etiquetas);
  const movimientos=(gastos.data??[]).filter(g=>dentroFecha(g.fecha)&&(!filtros.op||g.operativo_id===filtros.op));
  const opciones=[...(ops.data??[])].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const enCurso=opciones.filter(o=>!esOperativoArchivado(o.estado));
  const archivados=opciones.filter(o=>esOperativoArchivado(o.estado));
  const opcion=(o: (typeof opciones)[number])=><option value={o.id} key={o.id}>{o.nombre} · {fechaLegible(o.fecha)}</option>;
  const selectorSedes=<>{enCurso.map(opcion)}{archivados.length>0&&<optgroup label="Archivados">{archivados.map(opcion)}</optgroup>}</>;
  const operativos=opciones.map(o=>({operativoId:o.id,nombre:o.nombre,fecha:o.fecha}));
  const filtroActivo=Boolean(filtros.op||desde||hasta);
  const periodo=lista.length===1?lista[0].nombre:filtroActivo?`${lista.length} sedes seleccionadas`:'Todos los operativos';
  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-3xl font-bold">Gastos</h1>
      {vista!=='registrar'&&<Link href={enlace('registrar')} className="rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">Registrar gasto</Link>}
    </header>
    <nav className="grid grid-cols-3 gap-1 rounded-2xl border border-tinta/10 bg-white p-1 sm:inline-grid" aria-label="Gastos">
      {[['pendientes','Pendientes'],['historial','Historial'],['rentabilidad','Rentabilidad']].map(([clave, titulo])=><Link key={clave} href={enlace(clave)} aria-current={vista===clave?'page':undefined} className={`rounded-xl px-2 py-3 text-center text-sm font-semibold sm:px-5 ${vista===clave?'bg-tinta text-white':'text-tinta-suave'}`}>{titulo}</Link>)}
    </nav>
    {filtros.guardado==='1'&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Registro guardado.</p>}
    {vista==='registrar'?<section className="max-w-xl rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold">Registrar gasto pagado</h2>
      <p className="mt-1 text-sm text-tinta-suave">Para saldar un costo listado por sede, usa Pagar en Pendientes.</p>
          <form action={crearGastoGlobal} className="mt-3 grid gap-3"><input type="hidden" name="volver_gastos" value="1" /><input type="hidden" name="id" value={randomUUID()} />
            <label className="text-sm">Qué se pagó<input name="descripcion" placeholder="Arriendo del equipo, bandejas…" maxLength={250} required className={campo} /></label>
            <label className="text-sm">Operativo<select name="operativo_id" className={campo} defaultValue={filtros.op??''}><option value="">Gasto general</option>{selectorSedes}</select></label>
            <label className="text-sm">Nota de la compra<textarea name="nota" rows={3} maxLength={1000} placeholder="Qué se compró, cantidades y para qué se usará" className={campo}/></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm">Fecha<input type="date" name="fecha" defaultValue={hoy} max={hoy} required className={campo} /></label><label className="text-sm">Monto<input name="monto" type="number" min="1" step="1" required className={campo} /></label></div>
            <label className="text-sm">De dónde salió<select name="caja" required defaultValue="" className={campo}><option value="" disabled>Elige el origen</option><option value="digital">{piloto ? 'Cuenta bancaria' : 'Cuenta bancaria (Mercado Pago)'}</option><option value="efectivo">Efectivo de la óptica</option><option value="personal">{piloto ? 'Fondo personal' : `Dinero personal de ${nombres.pablo}`}</option></select></label>
            <label className="text-sm">Categoría<select name="categoria" className={campo}><option value="otro">Otro gasto</option><option value="arriendo">Arriendo</option><option value="compra_inventario">Inventario / equipamiento</option></select></label>
            <label className="text-sm">Medio de pago<select name="medio_pago" className={campo}><option value="">Sin especificar</option><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></label>
            <BotonEnviar className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">Guardar gasto</BotonEnviar>
          </form>
    </section>:<>
    <details className="rounded-2xl border border-tinta/10 bg-white p-4" open={filtroActivo}>
      <summary className="cursor-pointer text-sm font-semibold">Filtrar por sede o fechas{filtroActivo?' · activo':''}</summary>
      <form className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
        <input type="hidden" name="ver" value={vista}/>
        <label className="min-w-0 text-sm">Sede<select name="op" defaultValue={filtros.op??''} className="mt-1 w-full rounded-xl border p-3"><option value="">Todas las sedes</option>{selectorSedes}</select></label>
        <label className="min-w-0 text-sm">Desde<input type="date" name="desde" defaultValue={desde} className="mt-1 block w-full rounded-xl border p-3"/></label>
        <label className="min-w-0 text-sm">Hasta<input type="date" name="hasta" min={desde||undefined} defaultValue={hasta} className="mt-1 block w-full rounded-xl border p-3"/></label>
        <button className="rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">Aplicar</button>
        <Link href={vista==='pendientes'?'/gastos':`/gastos?ver=${vista}`} className="px-3 py-3 text-center text-sm underline">Limpiar</Link>
      </form>
    </details>
    {desde&&hasta&&desde>hasta&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">La fecha de inicio debe ser anterior a la fecha de término.</p>}
    {vista==='pendientes'&&<>
      <GastosPanel key={`${filtros.op??''}:${desde}:${hasta}`} filas={filas} gastos={gastos.data??[]} asignaciones={asignaciones.data??[]} hoy={hoy} gastosSii={gastosSii} enfocarSede={Boolean(filtros.op)} />
      <GastosPersonales gastos={personales} hoy={hoy}/>
    </>}
    {vista==='historial'&&<>
      <ChequeoFinanciero key={`historial:${filtros.op??''}:${desde}:${hasta}`}
        soloGastos movimientos={movimientos.map(g=>({...g,tabla:'gastos_globales'})) as MovimientoRevision[]}
        operativos={operativos} hoy={hoy} inicial={filtros.op??''} historial={auditoria.data??[]} />
      <GastosPanel historial filas={filas} gastos={gastos.data??[]} asignaciones={asignaciones.data??[]} hoy={hoy} gastosSii={gastosSii} />
    </>}
    {(vista==='pendientes'||rentabilidad)&&<details className="rounded-2xl border border-tinta/10 bg-white p-4" open={rentabilidad}>
      <summary className="cursor-pointer font-semibold">Resumen financiero · {periodo}</summary>
      <section className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Resumen de gastos">
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Costos totales</h2><b className="block text-lg tabular-nums">{clp(costosTotales)}</b><p className="text-sm text-tinta-suave">Ventas por {clp(vendido)}</p></div>
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Costos pendientes por sede</h2><b className="block text-lg tabular-nums">{clp(pendiente)}</b></div>
        <div className="rounded-xl bg-crema p-3"><h2 className="text-sm">Ganancia operativa</h2><b className={`block text-lg tabular-nums ${utilidad<0?'text-red-800':'text-accent-dark'}`}>{clp(utilidad)}</b><p className="text-sm text-tinta-suave">Margen {margen===null?'sin ventas':`${margen.toLocaleString('es-CL',{maximumFractionDigits:1})}%`} · antes de IVA</p></div>
      </section>
      <dl className="mt-3 divide-y divide-tinta/10 text-sm" aria-label="Desglose de costos totales">
        {desgloseCostos.map(([concepto,monto])=><div key={concepto} className="flex justify-between gap-3 py-2"><dt>{concepto}</dt><dd className="font-medium tabular-nums">{clp(monto)}</dd></div>)}
      </dl>
      <p className="mt-2 text-xs text-tinta-suave">Ganancia operativa = ventas menos costos totales. Incluye ventas por cobrar. Cada abono reduce el saldo por pagar.</p>
    </details>}
    {rentabilidad&&cotizar&&<SimuladorSalida key={`presupuesto:${desde}:${hasta}:${filtros.op??''}`} titulo="Simular ganancias" fijosRegistrados={filas.reduce((s,o)=>s+Object.values(o.importes).reduce((a,b)=>a+b,0),0)+overhead} perfiles={perfiles} recargosMarcos={cotizar.recargosMarcos} debito={debito} credito={credito} historica={historica} comisionVenta={ventasSeleccionadas.length?Math.max(...ventasSeleccionadas):10}/>}
    </>}
  </div>;
}
