import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import { GastoGeneralForm } from "@/components/registro-gasto";
import { cargarCajaChequeo } from "@/lib/datos-caja-chequeo";
import { exigirRolPagina } from "@/lib/autorizacion";
import type { Chequeo, SedeChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import { PERSONAS_SUELDO } from "@/lib/reparto-operativos";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import ActualizarCaja from "./actualizar-caja";
import FormularioChequeo from "./formulario";
import { IndicadoresCaja, IndicadoresChequeo } from "./indicadores";
import PersonasDeSede from "./personas-de-sede";

const ruta = "/operativos/chequeos";
function RecuadroReparto({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return <div className="min-w-0 rounded-lg border border-tinta/15 bg-white p-3 sm:p-4">
    <dt className="text-sm font-semibold">{etiqueta}</dt>
    <dd className="mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl">{valor}</dd>
  </div>;
}

export default async function ChequeosPage({ searchParams }: {
  searchParams: Promise<{ chequeo?: string; modo?: string; guardado?: string; sede?: string }>;
}) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const params = await searchParams;
  const hoy = hoyEnChile();
  const [grupos, operativos] = await Promise.all([
    leerTodas((a, b) => supabase.from("chequeos").select("id,nombre,desde,hasta,ahorro_pct,comision_isadora_pct,reparto_pamela_pct")
      .eq("tenant_id", tenantId).order("desde", { ascending: false }).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("operativos").select("*").eq("tenant_id", tenantId)
      .order("fecha").order("hora_inicio", { nullsFirst: false }).order("id").range(a, b)),
  ]);
  if (grupos.error || operativos.error) return <p role="alert" className="rounded-lg bg-red-50 p-4">No se pudieron cargar los chequeos. Recarga para reintentar.</p>;

  const chequeos = (grupos.data ?? []) as Chequeo[];
  const chequeo = chequeos.find(c => c.id === params.chequeo);
  const sedes = (operativos.data ?? []) as SedeChequeo[];
  const cabecera = <CabeceraPagina seccion="Operativos" titulo="Chequeos" acciones={
    <>
      <Link href={chequeo ? ruta : "/operativos"} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">
        {chequeo ? "Todos los chequeos" : "Ver operativos"}
      </Link>
      <Link href={`${ruta}?modo=nuevo`} className="rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white">Nuevo chequeo</Link>
    </>
  } />;

  if (params.modo === "nuevo" || (params.modo === "editar" && chequeo)) {
    const actual = params.modo === "editar" ? chequeo : undefined;
    const elegibles = sedes.filter(s => s.chequeo_id ? s.chequeo_id === actual?.id : s.estado !== "cancelado");
    return <div className="mx-auto max-w-2xl space-y-4">{cabecera}<h2 className="text-lg font-semibold">{actual ? "Editar chequeo" : "Nuevo chequeo"}</h2>
      <FormularioChequeo chequeo={actual} sedes={elegibles.map(({id,nombre,fecha,fecha_fin,direccion,chequeo_id}) => ({id,nombre,fecha,fecha_fin,direccion,chequeo_id}))} hoy={hoy} />
    </div>;
  }
  if (!chequeo) {
    const sedesPorChequeo = new Map<string, number>();
    for (const s of sedes) {
      if (s.chequeo_id && s.estado !== "cancelado") sedesPorChequeo.set(s.chequeo_id, (sedesPorChequeo.get(s.chequeo_id) ?? 0) + 1);
    }
    return <div className="mx-auto max-w-6xl space-y-4">
      {cabecera}
      {!chequeos.length ? <p className="rounded-lg bg-white p-4">Crea un chequeo para juntar las sedes de un operativo.</p>
        : <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {chequeos.map(c => <li key={c.id}>
            <Link href={`${ruta}?chequeo=${c.id}`} className="block rounded-lg border border-tinta/15 bg-white p-4 hover:border-brand">
              <h2 className="text-lg font-bold">{c.nombre}</h2>
              <p className="mt-1 text-sm text-tinta-suave">{fechaLegible(c.desde)} al {fechaLegible(c.hasta)} · {sedesPorChequeo.get(c.id) ?? 0} sedes</p>
            </Link>
          </li>)}
        </ul>}
    </div>;
  }

  const integrantes = sedes.filter(s => s.chequeo_id === chequeo.id && s.estado !== "cancelado");
  if (params.sede) {
    const sede = integrantes.find(s => s.id === params.sede);
    return <div className="mx-auto max-w-3xl space-y-4">{cabecera}
      {sede ? <PersonasDeSede supabase={supabase} tenantId={tenantId} sede={sede} volver={`${ruta}?chequeo=${chequeo.id}`} />
        : <p role="status" className="rounded-lg bg-white p-4">La sede ya no está en este chequeo.</p>}
    </div>;
  }
  const datos = await cargarCajaChequeo(supabase, tenantId, chequeo, integrantes, hoy);
  if (!datos) return <div className="space-y-4">{cabecera}<p role="alert" className="rounded-lg bg-red-50 p-4">No se pudo calcular el chequeo. Recarga para reintentar.</p></div>;
  const { n, caja, compartidos, ventas, tenant } = datos;
  const nombres = etiquetasReparto(tenant?.reparto_etiquetas);
  return <div className="mx-auto max-w-6xl space-y-5 pb-5">
    {cabecera}
    <ActualizarCaja />
    <section className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-xl font-bold">{chequeo.nombre}</h2>
        <p className="text-sm text-tinta-suave">{fechaLegible(chequeo.desde)} al {fechaLegible(chequeo.hasta)} · {n.filas.length} sedes</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`/caja?chequeo=${chequeo.id}`} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Caja y gastos</Link>
        <Link href={`/entregas?chequeo=${chequeo.id}`} className="rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white">Entregas por sede</Link>
        <Link href={`${ruta}?chequeo=${chequeo.id}&modo=editar`} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Asignar sedes</Link>
      </div>
    </section>
    <IndicadoresChequeo resumen={n} ventas={ventas} />
    <IndicadoresCaja resumen={n} caja={caja} hoy={hoy} chequeoId={chequeo.id} comidaGuardada={params.guardado === "comida"} />
    <section aria-labelledby="sedes-chequeo" className="space-y-2">
      <h2 id="sedes-chequeo" className="text-lg font-bold">Por sede</h2>
      {!n.filas.length && <p className="rounded-lg bg-white p-4">Este chequeo todavía no tiene sedes asignadas.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{n.filas.map(f => (
        <li key={f.sede.id} className="grid gap-2 rounded-lg border border-tinta/15 bg-white p-3">
          <Link href={`${ruta}?chequeo=${chequeo.id}&sede=${f.sede.id}`} className="block rounded-md hover:bg-crema-claro">
            <h3 className="font-bold text-brand-dark underline">{f.sede.nombre}</h3>
            <p className="text-sm text-tinta-suave">{fechaLegible(f.sede.fecha)}{f.sede.hora_inicio ? ` · ${f.sede.hora_inicio.slice(0, 5)}` : ""}{f.sede.direccion ? ` · ${f.sede.direccion}` : ""}</p>
            <span className="text-sm text-brand-dark">Ver personas y compras</span>
          </Link>
          <p className="text-sm">{f.pacientes} atendidos · {f.ventas} ventas · {f.pares} pares · {f.marcos} marcos</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-2 rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-sky-950">
              <dt className="font-semibold">Total vendido</dt><dd className="text-lg font-bold tabular-nums">{clp(f.vendido)}</dd>
            </div>
            <div><dt>Cobrado</dt><dd className="font-semibold">{clp(f.cobrado)}</dd></div>
            <div><dt>Por cobrar</dt><dd className="font-semibold">{clp(f.porCobrar)}</dd></div>
            <div><dt>Cristales</dt><dd className="font-semibold">{clp(f.desglose.totalCristales)}</dd></div>
            <div><dt>Marcos estimados</dt><dd className="font-semibold">{clp(f.desglose.totalArmazones)}</dd></div>
            <div><dt>Utilidad de la sede</dt><dd className="font-semibold">{clp(datos.repartoOperativos.find(r => r.sede.id === f.sede.id)?.utilidad ?? f.utilidad)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-brand-dark">
            {f.conSaldo > 0 && <Link className="underline" href={`/cobros?op=${f.sede.id}&ver=deben`}>Ver a quién cobrar ({f.conSaldo})</Link>}
            <Link className="underline" href={`/entregas?chequeo=${chequeo.id}&op=${f.sede.id}`}>Ver pedidos</Link>
            <Link className="underline" href={`/operativos/${f.sede.id}/cierre`}>Finalizar y pagar</Link>
          </div>
        </li>
      ))}</ul>
    </section>
    {params.guardado === "1" && <p role="status" className="text-sm text-emerald-800">Gasto guardado.</p>}
    <details id="gastos-compartidos" open={params.guardado === "1" ? true : undefined} className="scroll-mt-40 rounded-lg border border-tinta/15 bg-white p-4 lg:scroll-mt-20">
      <summary className="cursor-pointer font-semibold">Gastos compartidos · {clp(n.gastosCompartidos)}</summary>
      {compartidos.filter(g => g.categoria !== "compra_inventario").map(g => <p key={g.id} className="mt-2 flex justify-between gap-2 text-sm"><span>{g.descripcion} · {fechaLegible(g.fecha)}</span><b>{clp(g.monto)}</b></p>)}
      <div className="mt-4 max-w-lg"><GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" chequeoId={chequeo.id} /></div>
    </details>
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Sueldos por operativo</summary>
      <ul className="mt-2 divide-y divide-tinta/10">
        {datos.repartoOperativos.map(f => <li key={f.sede.id} className="py-2">
          <Link className="text-sm font-semibold underline" href={`/operativos/${f.sede.id}/cierre#sueldos`}>{f.sede.nombre}</Link>
          <dl className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PERSONAS_SUELDO.map(p => <div key={p} className="text-sm"><dt>{nombres[p]} por pagar</dt>
              <dd className="font-semibold tabular-nums">{clp(f.pendiente[p])}</dd></div>)}
          </dl>
        </li>)}
      </ul>
    </details>
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Reparto pendiente estimado</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <RecuadroReparto etiqueta={nombres.isadora} valor={clp(caja.comisionPendiente)} />
        <RecuadroReparto etiqueta="Ahorro" valor={clp(caja.repartoPendiente.ahorro)} />
        <RecuadroReparto etiqueta={nombres.madre} valor={clp(caja.repartoPendiente.madre)} />
        <RecuadroReparto etiqueta={nombres.pablo} valor={clp(caja.repartoPendiente.pablo)} />
      </dl>
    </details>
  </div>;
}
