import Link from "next/link";
import { cargarCajaChequeo, chequeoIndependiente, COLUMNAS_CHEQUEO, rutaReparto } from "@/lib/datos-caja-chequeo";
import { clp } from "@/lib/clp";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { hoyEnChile, ultimoDiaDelMes } from "@/lib/fechas";
import type { Chequeo, SedeChequeo } from "@/lib/chequeos";
import { leerTodas } from "@/lib/leer-todas";
import { PERSONAS_REPARTO, type MontosReparto } from "@/lib/reparto";
import type { createClient } from "@/lib/supabase/server";
import SueldosReparto from "./sueldos-reparto";

export default async function SueldosGlobales({ supabase, tenantId, mes: filtro }: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  tenantId: string;
  mes?: string;
}) {
  const hoy = hoyEnChile();
  const mes = filtro && /^\d{4}-(0[1-9]|1[0-2])$/.test(filtro) ? filtro : hoy.slice(0, 7);
  const inicio = mes + "-01";
  const fin = ultimoDiaDelMes(mes);
  const [chequeos, sedes, tenant] = await Promise.all([
    leerTodas((a, b) => supabase.from("chequeos").select(COLUMNAS_CHEQUEO).eq("tenant_id", tenantId)
      .gte("desde", inicio).lte("desde", fin).order("desde").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("operativos").select("*").eq("tenant_id", tenantId)
      .is("chequeo_id", null).neq("estado", "cancelado").gte("fecha", inicio).lte("fecha", fin)
      .order("fecha").order("id").range(a, b)),
    supabase.from("tenants").select("reparto_etiquetas").eq("id", tenantId).single(),
  ]);
  const independientes = (sedes.data ?? []) as SedeChequeo[];
  const grupos = (chequeos.data ?? []) as Chequeo[];
  const integrantes = await leerTodas((a, b) => grupos.length
    ? supabase.from("operativos").select("*").eq("tenant_id", tenantId).in("chequeo_id", grupos.map(g => g.id))
      .neq("estado", "cancelado").order("fecha").order("id").range(a, b)
    : Promise.resolve({ data: [], error: null }));
  const sedesGrupo = (integrantes.data ?? []) as SedeChequeo[];
  const ambitos = [
    ...grupos.map(chequeo => ({ chequeo, sedes: sedesGrupo.filter(s => s.chequeo_id === chequeo.id) })),
    ...independientes.map(sede => ({ chequeo: chequeoIndependiente(sede), sedes: [sede] })),
  ];
  const filas: { chequeo: Chequeo; datos: Awaited<ReturnType<typeof cargarCajaChequeo>> }[] = [];
  for (let i = 0; i < ambitos.length; i += 6) {
    filas.push(...await Promise.all(ambitos.slice(i, i + 6).map(async ({ chequeo, sedes }) => ({
      chequeo, datos: await cargarCajaChequeo(supabase, tenantId, chequeo, sedes, hoy),
    }))));
  }
  const error = chequeos.error || sedes.error || integrantes.error || tenant.error || filas.some(f => !f.datos);
  const nombres = etiquetasReparto(tenant.data?.reparto_etiquetas);
  const suma = (campo: "retirado" | "repartoPendiente") => Object.fromEntries(
    PERSONAS_REPARTO.map(p => [p, filas.reduce((total, f) => total + (f.datos?.caja[campo][p] ?? 0), 0)]),
  ) as MontosReparto;
  const pagado = suma("retirado");
  const pendiente = suma("repartoPendiente");
  const operativos = filas.flatMap(f => f.datos?.repartoOperativos ?? []);
  const totalizar = (monto: (fila: typeof operativos[number]) => number) => operativos.reduce((total, fila) => total + monto(fila), 0);
  const utilidad = totalizar(fila => fila.utilidad);
  const desglose = [
    ["Vendido", totalizar(f => f.vendido)], ["Marcos", -totalizar(f => f.desglose.totalArmazones)],
    ["Cristales", -totalizar(f => f.desglose.totalCristales)], ["Otros productos", -totalizar(f => f.desglose.totalOtros)],
    ["Gastos de los operativos y chequeos", -totalizar(f => f.gastos + f.gastosComunes)],
    ["Comisiones de ventas y tarjeta", -totalizar(f => f.comisionVentas + f.comisionTarjeta)],
    ["Reserva de IVA", -totalizar(f => f.iva)], ["Utilidad global", utilidad],
  ] as const;

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xl font-bold">Sueldos globales</h2>
      <form action="/caja" className="flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="ver" value="sueldos" />
        <label>Mes <input className="rounded-lg border bg-white px-2 py-1.5" type="month" name="mes" defaultValue={mes} /></label>
        <button className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white">Ver</button>
      </form>
    </div>
    <p className="text-sm text-tinta-suave">Operativos independientes y chequeos iniciados en el mes. Incluye los gastos asociados y sus pagos registrados hasta hoy.</p>
    {error ? <p role="alert" className="rounded-lg bg-amber-50 p-3">No se pudieron calcular todos los sueldos. Recarga la página.</p> : <>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-white p-3"><dt>Utilidad global</dt><dd className="text-xl font-bold">{clp(utilidad)}</dd></div>
        <div className="rounded-xl bg-emerald-50 p-3"><dt>Ahorro estimado en la óptica</dt><dd className="text-xl font-bold">{clp(pendiente.ahorro)}</dd></div>
      </dl>
      <details className="rounded-xl bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">Ver el cálculo de utilidad global</summary>
        <dl className="mt-2 space-y-1 text-sm">
          {desglose.map(([nombre, monto]) => <div key={nombre} className="flex justify-between gap-2">
            <dt>{nombre}</dt><dd className="tabular-nums">{clp(monto)}</dd>
          </div>)}
        </dl>
      </details>
      <div className="rounded-xl bg-white p-3"><SueldosReparto nombres={nombres} pagado={pagado} pendiente={pendiente} /></div>
      {filas.some(f => f.datos?.retirosSinAsignar) && <Link className="text-sm font-semibold underline" href="/reportes#retiros">Revisar retiros sin asociar</Link>}
      <ul className="divide-y divide-tinta/10 rounded-xl bg-white px-3">
        {filas.map(({ chequeo, datos }) => datos && <li key={chequeo.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
          <Link href={rutaReparto(chequeo)} className="font-semibold underline">{chequeo.nombre}</Link>
          <span className="tabular-nums">Utilidad {clp(datos.n.utilidad - datos.n.iva)} · Por cobrar {clp(datos.n.porCobrar)}</span>
        </li>)}
      </ul>
    </>}
  </section>;
}
