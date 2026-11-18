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

export default async function Gastos({searchParams}:{searchParams:Promise<{op?:string;desde?:string;hasta?:string}>}) {
  const {supabase}=await exigirRolPagina(['admin']);
  const filtros=await searchParams;
  const desde=fechaValidaDocumento(filtros.desde??'') ? filtros.desde! : '';
  const hasta=fechaValidaDocumento(filtros.hasta??'') ? filtros.hasta! : '';
  const [ops,ventas,gastos,asignaciones,tenant,recetas,impuestosPagos]=await Promise.all([
    leerTodas((a,b)=>supabase.from('operativos').select('*').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('ventas').select(`id,operativo_id,total,pagos_abonos(monto,medio_pago),venta_items(cantidad,precio_unitario,descuento,descripcion,cristal_slot,ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2),productos:producto_id(costo,categoria))`).eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,operativo_id,fecha,descripcion,monto,categoria,caja').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_asignaciones').select('id,gasto_id,operativo_id,clave,monto,anulado_en').order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').single(),
    leerTodas((a,b)=>supabase.from('recetas').select('id,paciente_id,operativo_id').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('impuestos_pagos').select('gasto_id').is('anulado_en',null).order('id').range(a,b)),
  ]);
  if (ops.error||ventas.error||gastos.error||asignaciones.error||tenant.error||recetas.error||impuestosPagos.error) return <p role="alert" className="rounded-xl bg-red-50 p-5">No se pudieron cargar todos los gastos. Recarga antes de registrar pagos.</p>;
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
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Gastos y utilidad</h1><Link href="/caja" className="rounded-xl border bg-white px-4 py-3">Ver caja</Link></div>
    <Link href="/impuestos" className="block rounded-xl bg-tinta p-4 font-semibold text-white">SII mensual · declarado, estimado y saldo acumulado →</Link>
    <form className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4">
      <label className="min-w-48 flex-1 text-sm">Operativo<select name="op" defaultValue={filtros.op??''} className="mt-1 w-full rounded-xl border p-3"><option value="">Todos / salida completa</option>{[...(ops.data??[])].sort((a,b)=>b.fecha.localeCompare(a.fecha)).map(o=><option value={o.id} key={o.id}>{o.fecha} · {o.nombre}</option>)}</select></label>
      <label className="text-sm">Desde<input type="date" name="desde" defaultValue={desde} className="mt-1 block rounded-xl border p-3"/></label>
      <label className="text-sm">Hasta<input type="date" name="hasta" defaultValue={hasta} className="mt-1 block rounded-xl border p-3"/></label>
      <button className="rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Ver</button><Link href="/gastos" className="p-3 underline">Todos</Link>
    </form>
    <Link href="/gastos?desde=2026-11-23&hasta=2026-11-28" className="block rounded-xl bg-sky-50 p-4 font-semibold text-sky-900">Salida 23–28 de noviembre · presupuesto y gastos →</Link>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Resumen de gastos">
      {[['Ventas',filas.reduce((s,o)=>s+o.vendido,0)],['Costos de operativos',filas.reduce((s,o)=>s+o.costo,0)],['Gastos generales adicionales',overhead],['Utilidad operativa',utilidad]].map(([titulo,monto])=><div key={String(titulo)} className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-sm">{titulo}</h2><b className={`mt-2 block text-xl tabular-nums ${Number(monto)<0?'text-red-700':''}`}>{clp(Number(monto))}</b></div>)}
    </section>
    <p className="text-xs text-tinta-suave">Utilidad según ventas y costos registrados, antes de impuestos, ahorro y reparto. Los pagos saldan deudas; no restan el mismo costo dos veces. Comprar stock baja la caja; la utilidad considera los marcos vendidos.</p>
    <GastosPanel key={`${filtros.op??''}:${desde}:${hasta}`} filas={filas} gastos={gastos.data??[]} asignaciones={asignaciones.data??[]} hoy={hoyEnChile()} generales={generales} gastosSii={gastosSii} />
    <SimuladorSalida key={`presupuesto:${desde}:${hasta}`} titulo={desde&&hasta?`Presupuesto ${desde} al ${hasta}`:'Simular una salida'} fijosRegistrados={filas.reduce((s,o)=>s+Object.values(o.importes).reduce((a,b)=>a+b,0),0)} />
  </div>;
}
