import Link from 'next/link';
import {exigirRolPagina} from '@/lib/autorizacion';
import {leerTodas} from '@/lib/leer-todas';
import {hoyEnChile,diaEnChile} from '@/lib/fechas';
import {mesesDesde,impuestoDeMes,resumirImpuestos,type MesImpuesto} from '@/lib/impuestos';
import ImpuestosPanel from '@/components/impuestos-panel';
import {clp} from '@/lib/clp';
export default async function Impuestos(){
  const {supabase}=await exigirRolPagina(['admin']);
  const [meses,pagos,gastos,ventas,asignaciones]=await Promise.all([
    leerTodas((a,b)=>supabase.from('impuestos_mensuales').select('*').order('periodo').range(a,b)),
    leerTodas((a,b)=>supabase.from('impuestos_pagos').select('id,periodo,gasto_id,anulado_en').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,fecha,monto,caja,descripcion,categoria,operativo_id').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('ventas').select('id,fecha,total,boleta_fecha').eq('anulada',false).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_asignaciones').select('id,gasto_id,anulado_en').order('id').range(a,b)),
  ]);
  if(meses.error||pagos.error||gastos.error||ventas.error||asignaciones.error)return <p role="alert" className="rounded-xl bg-red-50 p-4">No se pudo leer el control del SII. Recarga antes de registrar pagos.</p>;
  const hoy=hoyEnChile();
  const fechaVenta=(v:{fecha:string;boleta_fecha:string|null})=>v.boleta_fecha??diaEnChile(v.fecha);
  const fechas=(ventas.data??[]).map(fechaVenta).concat((meses.data??[]).map(m=>m.periodo)).sort();
  const periodos=mesesDesde(fechas[0]??hoy,hoy);
  const filas=periodos.map(periodo=>{
    const m=(meses.data??[]).find(m=>m.periodo===periodo) as MesImpuesto|undefined;
    const mes=m??{periodo,ventas_afectas:null,credito_fiscal:0,ppm:0,otros:0,recargos:0,total_declarado:null,vence_el:null,nota:'',version:-1};
    const registradas=(ventas.data??[]).filter(v=>fechaVenta(v).slice(0,7)===periodo.slice(0,7)).reduce((s,v)=>s+v.total,0);
    const pagosMes=(pagos.data??[]).filter(p=>p.periodo===periodo&&!p.anulado_en);
    const pagado=pagosMes.reduce((s,p)=>s+((gastos.data??[]).find(g=>g.id===p.gasto_id)?.monto??0),0);
    return {mes,registradas,n:impuestoDeMes(mes,registradas,pagado,hoy)};
  });
  const resumen=resumirImpuestos(filas.map(f=>f.n));
  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">SII · impuestos mensuales</h1><Link href="/gastos" className="rounded-xl border bg-white px-4 py-3">Gastos y utilidad</Link></div>
    <p className="rounded-xl bg-sky-50 p-4 text-sm">Control interno de Lentia. No consulta tu deuda oficial ni presenta declaraciones. Cada período conserva su saldo y el acumulado suma lo pendiente una sola vez. Confirma el total del F29 para convertir una estimación en monto declarado.</p>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Declarado por pagar',resumen.declarado],['Reserva estimada sin declarar',resumen.estimado],['Declarado vencido',resumen.vencido],['Pagos registrados',resumen.pagado]].map(([t,m])=><div key={String(t)} className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-sm">{t}</h2><b className="mt-2 block text-xl tabular-nums">{clp(Number(m))}</b></div>)}</section>
    <p className="text-sm">Total a controlar: <b>{clp(resumen.declarado+resumen.estimado)}</b> · separa deuda declarada de reservas estimadas.</p>
    <ImpuestosPanel key={JSON.stringify(filas.map(f=>[f.mes.periodo,f.mes.version,f.n.pagado]))} filas={filas} pagos={pagos.data??[]} gastos={gastos.data??[]} gastosEnCostos={(asignaciones.data??[]).filter(a=>!a.anulado_en).map(a=>a.gasto_id)} hoy={hoy}/>
    <p className="text-xs text-tinta-suave">Estimación IVA: 19/119 de las ventas afectas brutas menos crédito fiscal confirmado. Revisa ventas exentas y crédito utilizable, incluido remanente. PPM y retenciones se ingresan por su monto confirmado, sin asumir tasas. Reajustes, intereses y multas no se calculan automáticamente: copia el total vigente del SII/TGR. Un pago parcial anotado aquí no confirma que el F29 esté declarado o aceptado.</p>
    <div className="flex flex-wrap gap-4 text-sm underline"><a href="https://www.sii.cl/servicios_online/1042-3264.html" target="_blank" rel="noreferrer">Declaración mensual F29 · SII</a><a href="https://www.sii.cl/pagina/iva/guia_f29.htm" target="_blank" rel="noreferrer">Guía oficial del F29</a></div>
  </div>;
}
