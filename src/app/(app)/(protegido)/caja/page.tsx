import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { cargarPendientes } from '@/lib/resumen-pendientes';
import { leerTodas } from '@/lib/leer-todas';
import { clp } from '@/lib/clp';
import { fechaLegible } from '@/lib/fechas';
import { pendientePersonal } from '@/lib/caja-fuentes';
import { resumirCaja } from '@/lib/caja';
import { movimientosFinanzas, periodoFinanzas, resumenMovimientos } from '@/lib/finanzas';
import CuentaBancaria from '@/components/cuenta-bancaria';
import CajaHistorial from '@/components/caja-historial';
import FinanzasNav from '@/components/finanzas-nav';
import RefrescarFinanzas from '@/components/refrescar-finanzas';

export const dynamic = 'force-dynamic';
export default async function Caja({ searchParams }: { searchParams:Promise<{ guardado?:string; vista?:string; mes?:string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const [caja, pendientes, gastos, movimientos, conteos, cobros, retiros, tenant, params, cobrosAnulados] = await Promise.all([
    supabase.rpc('caja_global').single(), cargarPendientes(supabase),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,fecha,descripcion,monto,caja,operativo_id,confirmado_en').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('caja_movimientos').select('id,fecha,tipo,monto,caja,gasto_id,descripcion,created_at').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('caja_conteos').select('contado,esperado,nota,created_at').eq('tenant_id',tenantId).order('created_at',{ascending:false}).limit(1),
    leerTodas((a,b)=>supabase.from('pagos_abonos').select('id,fecha,monto,medio_pago,venta_id,ventas!inner(anulada,tenant_id)').eq('tenant_id',tenantId).eq('ventas.tenant_id',tenantId).eq('ventas.anulada',false).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('retiros_sueldo').select('id,fecha,monto,caja,persona,operativo_id,es_sueldo,motivo,confirmado_en').eq('tenant_id',tenantId).order('id').range(a,b)),
    supabase.from('tenants').select('comision_debito_pct,comision_credito_pct').eq('id',tenantId).single(), searchParams,
    leerTodas((a,b)=>supabase.from('pagos_abonos').select('id,monto,ventas!inner(anulada,tenant_id)').eq('tenant_id',tenantId).eq('ventas.tenant_id',tenantId).eq('ventas.anulada',true).order('id').range(a,b)),
  ]);
  const error = caja.error || pendientes.error || gastos.error || movimientos.error || conteos.error || cobros.error || retiros.error || tenant.error || cobrosAnulados.error || !caja.data;
  const vista = params.vista==='movimientos'?'movimientos':'resumen';
  if (error) return <div className="flex flex-col gap-5"><FinanzasNav activo={vista} nuevo={false} /><p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">No se pudo leer toda la información. No mostraremos saldos parciales. Recarga antes de registrar movimientos.</p><RefrescarFinanzas /></div>;
  const t = caja.data as { entro_efectivo:number; salio_efectivo:number; entro_digital:number; entro_debito:number; entro_credito:number; salio_digital:number };
  const saldo = resumirCaja({ entroEfectivo:t.entro_efectivo,entroDigital:t.entro_digital,entroDebito:t.entro_debito,
    entroCredito:t.entro_credito,salioEfectivo:t.salio_efectivo,salioDigital:t.salio_digital },
    { comisionDebitoPct:Number(tenant.data?.comision_debito_pct??0),comisionCreditoPct:Number(tenant.data?.comision_credito_pct??0) });
  const porGasto = new Map<string,number>();
  for (const m of movimientos.data??[]) if (m.gasto_id) porGasto.set(m.gasto_id,(porGasto.get(m.gasto_id)??0)+m.monto);
  const personales = (gastos.data??[]).filter(g=>g.caja==='personal').map(g=>({...g,pendiente:pendientePersonal(g.monto,[{monto:porGasto.get(g.id)??0}])})).filter(g=>g.pendiente>0);
  const deudaPersonal = personales.reduce((s,g)=>s+g.pendiente,0);
  const p = pendientes.resumen;
  const ultimo = conteos.data?.[0];
  const porConfirmar = [...(gastos.data??[]),...(retiros.data??[])].filter(m=>!m.confirmado_en).length;
  const sinMedio = (cobros.data??[]).filter(c=>!c.medio_pago).length;
  const montoAnulado = (cobrosAnulados.data??[]).reduce((s,c)=>s+c.monto,0);
  const filas = movimientosFinanzas({cobros:cobros.data??[],gastos:gastos.data??[],retiros:retiros.data??[],traslados:movimientos.data??[]});
  const periodo = periodoFinanzas(params.mes);
  const mes = filas.filter(f=>f.fecha>=periodo.desde && f.fecha<=periodo.hasta);
  const actividad = resumenMovimientos(mes);
  const categorias = [
    {nombre:'Equipo · Pablo, Pamela e Isadora',monto:p.sueldos,href:'/pagos?ver=sueldos',detalle:'Sueldos y adelantos por operativo'},
    {nombre:'Fides y marcos',monto:p.fides+p.marcos,href:'/pagos?ver=costos',detalle:'Cristales y reposición de marcos'},
    {nombre:'Costos de operativos',monto:p.gastos,href:'/pagos?ver=costos',detalle:'Equipos, transporte, salón y otros'},
    {nombre:'Devolver a Pablo',monto:deudaPersonal,href:'#personales',detalle:'Gastos pagados con dinero personal'},
  ];
  return <div className="flex flex-col gap-5"><FinanzasNav activo={vista} />
    {params.guardado==='1' && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Registro guardado.</p>}
    {vista==='movimientos'?<CajaHistorial filas={filas} mesInicial={periodo.mes} />:<>
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-slate-600">Dinero del negocio</h2><RefrescarFinanzas /></div>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <CuentaBancaria tenantId={tenantId} obligaciones={p.total+deudaPersonal+p.ahorro} registrado={{saldo:saldo.hayDigital,maquina:t.entro_debito+t.entro_credito,transferencias:t.entro_digital-t.entro_debito-t.entro_credito,salidas:saldo.salioDigital,comisiones:saldo.comisionTarjeta}} />
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-slate-700">Efectivo de la óptica</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Según registros</span></div>
          <p className={`mt-4 text-4xl font-bold tracking-tight tabular-nums ${saldo.hayEfectivo<0?'text-red-800':'text-slate-950'}`}>{clp(saldo.hayEfectivo)}</p>
          <p className="mt-2 text-xs text-slate-500">Esperado en caja · todos los movimientos registrados</p>
          {ultimo?<div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm"><div className="flex justify-between gap-2"><span>Último conteo</span><b>{clp(ultimo.contado)}</b></div><div className="mt-1 flex justify-between gap-2"><span>Diferencia al contar</span><b className={ultimo.contado===ultimo.esperado?'text-teal-800':'text-red-800'}>{clp(ultimo.contado-ultimo.esperado)}</b></div><p className="mt-2 text-xs text-slate-500">{new Date(ultimo.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</p></div>:<p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Aún falta un conteo físico para comprobarlo.</p>}
          <Link href="/caja/nuevo?tipo=conteo" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">Contar efectivo</Link>
        </section>
      </div>
      {(porConfirmar>0 || pendientes.sinAsignar || sinMedio>0) && <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div><h2 className="text-sm font-bold text-amber-950">Revisión pendiente</h2><p className="mt-1 text-sm text-amber-900">{porConfirmar>0?`${porConfirmar} registros sin confirmar. `:''}{pendientes.sinAsignar?'Hay retiros o aportes sin operativo asignado. ':''}{sinMedio>0?`${sinMedio} cobros sin medio de pago, incluidos como efectivo.`:''}</p></div><Link href="/pagos/revisar" className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-semibold text-amber-950">Revisar registros →</Link>
      </section>}
      {montoAnulado>0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Hay {clp(montoAnulado)} en cobros asociados a ventas anuladas. Comprueba si se devolvieron: la estimación de Lentia no incluye estos cobros. <Link href="/ventas/historial" className="font-semibold underline">Revisar ventas →</Link></p>}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-lg font-bold text-slate-950">Por pagar</h2><p className="mt-1 text-xs text-slate-500">Pendientes calculados · todavía no son salidas de dinero</p></div><b className="text-2xl tabular-nums text-slate-900">{clp(p.total+deudaPersonal)}</b></div>
        <div className="divide-y divide-slate-100">{categorias.map(c=><Link key={c.nombre} href={c.href} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50"><span><span className="block text-sm font-semibold text-slate-800">{c.nombre}</span><span className="mt-1 block text-xs text-slate-500">{c.detalle}</span></span><span className="shrink-0 text-sm font-bold tabular-nums text-slate-900">{clp(c.monto)} <span className="ml-2 text-slate-400" aria-hidden="true">→</span></span></Link>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm"><span className="text-slate-600">Ahorro por separar · {clp(p.ahorro)}</span><Link href="/pagos?ver=ahorro" className="font-semibold text-teal-900">Ver ahorro →</Link></div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold text-slate-950">Actividad del mes</h2><Link href={`/caja?vista=movimientos&mes=${periodo.mes}`} className="text-sm font-semibold text-teal-900">Ver movimientos →</Link></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">{[['Cobrado y aportado',actividad.entradas],['Pagos y salidas',actividad.salidas],['Gastos con dinero personal',actividad.personal]].map(([n,v])=><div key={n}><p className="text-xs text-slate-500">{n}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{clp(Number(v))}</p></div>)}</div><p className="mt-3 text-xs text-slate-500">Antes de comisiones. Los traslados no aumentan entradas ni salidas totales.</p>
      </section>
      <section id="personales" className="scroll-mt-36 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Dinero personal de Pablo</h2><p className="mt-1 text-xs text-slate-500">Gastos de la óptica pagados por Pablo, pendientes de devolución.</p></div><Link href="/caja/nuevo?tipo=gasto" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold">Registrar gasto</Link></div>
        {personales.length===0?<p className="mt-4 text-sm text-slate-500">Sin gastos personales pendientes registrados.</p>:<ul className="mt-3 divide-y divide-slate-100">{personales.map(g=><li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{g.descripcion}</p><p className="mt-1 text-xs text-slate-500">{fechaLegible(g.fecha)} · pendiente {clp(g.pendiente)}</p></div><Link href={`/caja/nuevo?tipo=devolucion&gasto=${g.id}`} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold">Registrar devolución</Link></li>)}</ul>}
      </section>
      <div className="flex flex-wrap gap-x-5 gap-y-3 px-1 text-sm font-semibold text-slate-600">{[['/reportes','Reportes y reparto'],['/caja/mercadopago','Cobros y vouchers'],['/boleta','Boletas'],['/seguros','Reembolsos']].map(([href,n])=><Link key={href} href={href} className="underline decoration-slate-300 underline-offset-4">{n}</Link>)}</div>
    </>}
  </div>;
}
