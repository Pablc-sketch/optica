import { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";
import { costoRealCristal, precioVentaCristal } from "@/lib/precio-venta";
import { comisionHistorica } from "@/lib/rentabilidad-precios";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { leerTodas } from '@/lib/leer-todas';
import { numerosDeOperativo, type VentaParaCierre } from '@/lib/cierre-operativo';
import { COSTOS, pagosConAsignaciones, pagadoCon, pendientesCostos, PREFIJO_FIDES, PREFIJO_MARCOS, esPagoDeCosto, disponibleDeGasto } from '@/lib/pagos-operativo';
import { hoyEnChile } from '@/lib/fechas';
import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import GastosPanel from '@/components/gastos-panel';
import SimuladorSalida from '@/components/simulador-salida';
import { clp } from '@/lib/clp';
import {pendientePersonal} from '@/lib/caja-fuentes';
import GastosPersonales from '@/components/gastos-personales';

export default async function Gastos({searchParams}:{searchParams:Promise<{op?:string;desde?:string;hasta?:string;ver?:string}>}) {
  const {supabase,tenantId}=await exigirRolPagina(['admin']);
  const filtros=await searchParams;
  const rentabilidad=filtros.ver==="rentabilidad";
  const desde=fechaValidaDocumento(filtros.desde??'') ? filtros.desde! : '';
  const hasta=fechaValidaDocumento(filtros.hasta??'') ? filtros.hasta! : '';
  const [ops,ventas,gastos,asignaciones,tenant,recetas,impuestosPagos,devoluciones]=await Promise.all([
    leerTodas((a,b)=>supabase.from('operativos').select('*').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('ventas').select(`id,operativo_id,total,pagos_abonos(monto,medio_pago),venta_items(cantidad,precio_unitario,descuento,descripcion,cristal_slot,ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2),productos:producto_id(costo,categoria))`).eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,operativo_id,fecha,descripcion,monto,categoria,caja,nota,monto_estimado').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_asignaciones').select('id,gasto_id,operativo_id,clave,monto,anulado_en').order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').single(),
    leerTodas((a,b)=>supabase.from('recetas').select('id,paciente_id,operativo_id').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('impuestos_pagos').select('gasto_id').is('anulado_en',null).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('caja_movimientos').select('id,gasto_id,monto').eq('tenant_id',tenantId).eq('tipo','devolucion').order('id').range(a,b)),
  ]);
  if (ops.error||ventas.error||gastos.error||asignaciones.error||tenant.error||recetas.error||impuestosPagos.error||devoluciones.error) return <p role="alert" className="rounded-xl bg-red-50 p-5">No se pudieron cargar todos los gastos. Recarga antes de registrar pagos.</p>;
  const personales=(gastos.data??[]).filter(g=>g.caja==='personal').map(g=>({...g,pendiente:pendientePersonal(g.monto,(devoluciones.data??[]).filter(d=>d.gasto_id===g.id))})).filter(g=>g.pendiente>0).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const lista=(ops.data??[]).filter(o=>(!filtros.op||o.id===filtros.op)&&(!desde||o.fecha>=desde)&&(!hasta||o.fecha<=hasta)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  const ids=new Set(lista.map(o=>o.id));
  const filas=lista.map(o=>{
    const n=numerosDeOperativo(o,(ventas.data??[]).filter(v=>v.operativo_id===o.id) as unknown as VentaParaCierre[],Number(tenant.data?.comision_debito_pct??0),Number(tenant.data?.comision_credito_pct??0));
    const pagos=pagosConAsignaciones((gastos.data??[]).filter(g=>g.operativo_id===o.id),asignaciones.data??[],o.id);
    const costos=[{clave:'fides',titulo:'Cristales / laboratorio',total:n.desglose.totalCristales,pagado:pagadoCon(pagos,PREFIJO_FIDES)},
      {clave:'marcos',titulo:`Marcos (${n.desglose.marcos} × ${clp(o.costo_marco_unitario)})`,total:n.desglose.totalArmazones,pagado:pagadoCon(pagos,PREFIJO_MARCOS)},...pendientesCostos(o,pagos)];
    const atendidos=new Set((recetas.data??[]).filter(r=>r.operativo_id===o.id).map(r=>r.paciente_id)).size;
    return {id:o.id,nombre:o.nombre,fecha:o.fecha,vendido:n.vendido,cobrado:n.cobrado,utilidad:n.cierre.gananciaLiquida,costo:n.cierre.gastoTotal,
      atendidos,pares:n.desglose.marcos,costoFidesActual:o.costo_fides_real,costos,
      importes:Object.fromEntries(COSTOS.map(c=>[c.clave,Number(o[c.clave]??0)])),costoMarco:o.costo_marco_unitario};
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
  const consulta=new URLSearchParams();
  if(filtros.op)consulta.set('op',filtros.op);
  if(desde)consulta.set('desde',desde);
  if(hasta)consulta.set('hasta',hasta);
  const enlace=(simular:boolean)=>{const p=new URLSearchParams(consulta);if(simular)p.set('ver','rentabilidad');return `/gastos${p.size?`?${p}`:''}`;};
  const filtroActivo=Boolean(filtros.op||desde||hasta);
  const periodo=lista.length===1?lista[0].nombre:filtroActivo?`${lista.length} sedes seleccionadas`:'Todos los operativos';
  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-3xl font-bold">Gastos y ganancias</h1><p className="mt-1 text-sm text-tinta-suave">{periodo}</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/caja?ver=movimientos#nuevo-gasto" className="rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">Registrar gasto</Link><Link href="/caja" className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold">Ver caja</Link></div>
    </header>
    <nav className="inline-flex max-w-full gap-1 rounded-2xl border border-tinta/10 bg-white p-1" aria-label="Gastos y rentabilidad">
      <Link href={enlace(false)} aria-current={!rentabilidad?'page':undefined} className={`rounded-xl px-5 py-3 text-sm font-semibold ${!rentabilidad?'bg-tinta text-white':'text-tinta-suave'}`}>Gastos</Link>
      <Link href={enlace(true)} aria-current={rentabilidad?'page':undefined} className={`rounded-xl px-5 py-3 text-sm font-semibold ${rentabilidad?'bg-tinta text-white':'text-tinta-suave'}`}>Simular ganancias</Link>
    </nav>
    {!rentabilidad&&<GastosPersonales gastos={personales} hoy={hoyEnChile()}/>}
    <details className="rounded-2xl border border-tinta/10 bg-white p-4" open={filtroActivo}>
      <summary className="cursor-pointer text-sm font-semibold">Filtrar por sede o fechas{filtroActivo?' · activo':''}</summary>
      <form className="mt-4 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto_auto]">
        <input type="hidden" name="ver" value={rentabilidad?'rentabilidad':'gastos'}/>
        <label className="min-w-0 text-sm">Sede<select name="op" defaultValue={filtros.op??''} className="mt-1 w-full rounded-xl border p-3"><option value="">Todas las sedes</option>{[...(ops.data??[])].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(o=><option value={o.id} key={o.id}>{o.fecha} · {o.nombre}</option>)}</select></label>
        <label className="min-w-0 text-sm">Desde<input type="date" name="desde" defaultValue={desde} className="mt-1 block w-full rounded-xl border p-3"/></label>
        <label className="min-w-0 text-sm">Hasta<input type="date" name="hasta" min={desde||undefined} defaultValue={hasta} className="mt-1 block w-full rounded-xl border p-3"/></label>
        <button className="rounded-xl bg-tinta px-4 py-3 text-sm font-semibold text-white">Aplicar</button>
        <Link href={rentabilidad?'/gastos?ver=rentabilidad':'/gastos'} className="px-3 py-3 text-center text-sm underline">Limpiar</Link>
      </form>
    </details>
    {desde&&hasta&&desde>hasta&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">La fecha de inicio debe ser anterior a la fecha de término.</p>}
    {!rentabilidad&&<>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumen de gastos">
        <div className="rounded-2xl border border-tinta/10 bg-white p-5"><h2 className="text-sm text-tinta-suave">Costos totales</h2><b className="mt-2 block text-2xl tabular-nums">{clp(costosTotales)}</b><p className="mt-2 text-sm text-tinta-suave">De ventas por {clp(vendido)}</p></div>
        <div className="rounded-2xl border border-tinta/20 bg-white p-5"><h2 className="text-sm font-semibold text-tinta-suave">Costos de sedes por pagar</h2><b className="mt-2 block text-3xl tabular-nums text-tinta">{clp(pendiente)}</b><p className="mt-2 text-sm text-tinta-suave">Laboratorio y operación</p></div>
        <div className={`rounded-2xl border p-5 ${utilidad<0?'border-red-200 bg-red-50':'border-accent/20 bg-accent/10'}`}><h2 className="text-sm">Ganancia operativa</h2><b className={`mt-2 block text-2xl tabular-nums ${utilidad<0?'text-red-800':'text-accent-dark'}`}>{clp(utilidad)}</b><p className="mt-2 text-sm">Margen {margen===null?'sin ventas':`${margen.toLocaleString('es-CL',{maximumFractionDigits:1})}%`} · antes de IVA</p></div>
      </section>
      <details className="rounded-xl px-1 text-sm text-tinta-suave"><summary className="cursor-pointer">Cómo se calcula el margen</summary><div className="mt-3 space-y-2 rounded-2xl border border-tinta/10 bg-white p-4">
        <p>Ganancia operativa = ventas − costos de productos y sedes − comisiones − gastos generales sin asignar. Margen = ganancia ÷ ventas × 100. Incluye ventas pendientes de cobro y costos pendientes de pago.</p>
        <p>Antes de IVA, impuesto a la renta, ahorro y reparto. La compra de stock afecta caja; aquí se descuenta su consumo. Pagar o vincular un gasto salda la deuda sin restar el costo otra vez.</p>
        <div className="flex flex-wrap gap-4"><span>Costos de sedes: {clp(costosTotales-overhead)}</span><span>Generales adicionales: {clp(overhead)}</span><Link href="/impuestos" className="font-semibold underline">Ver IVA mensual</Link></div>
      </div></details>
      <GastosPanel key={`${filtros.op??''}:${desde}:${hasta}`} filas={filas} gastos={gastos.data??[]} asignaciones={asignaciones.data??[]} hoy={hoyEnChile()} generales={generales.filter(g=>g.caja!=='personal'||!personales.some(p=>p.id===g.id))} gastosSii={gastosSii} />
    </>}
    {rentabilidad&&cotizar&&<SimuladorSalida key={`presupuesto:${desde}:${hasta}:${filtros.op??''}`} titulo="Simular ganancias" fijosRegistrados={filas.reduce((s,o)=>s+Object.values(o.importes).reduce((a,b)=>a+b,0),0)+overhead} perfiles={perfiles} recargosMarcos={cotizar.recargosMarcos} debito={debito} credito={credito} historica={historica} comisionVenta={ventasSeleccionadas.length?Math.max(...ventasSeleccionadas):10}/>}
  </div>;
}
