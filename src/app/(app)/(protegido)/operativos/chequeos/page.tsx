import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import { GastoGeneralForm } from "@/components/registro-gasto";
import { exigirRolPagina } from "@/lib/autorizacion";
import { resumirChequeo, type AtencionChequeo, type Chequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import { disponibleDeGasto } from "@/lib/pagos-operativo";
import FormularioChequeo from "./formulario";

const ruta = "/operativos/chequeos";

function Recuadro({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: number | string; destacado?: boolean }) {
  return <div className={`min-w-0 rounded-lg border px-3 py-3 sm:p-4 ${destacado ? "border-sky-800 bg-sky-950 text-white" : "border-tinta/15 bg-white"}`}>
    <dt className="text-sm font-semibold">{etiqueta}</dt>
    <dd className="mt-1 break-words text-xl font-bold tabular-nums sm:text-2xl">{valor}</dd>
  </div>;
}

export default async function ChequeosPage({ searchParams }: {
  searchParams: Promise<{ chequeo?: string; modo?: string; guardado?: string }>;
}) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const params = await searchParams;
  const hoy = hoyEnChile();
  const [grupos, operativos] = await Promise.all([
    leerTodas((a, b) => supabase.from("chequeos").select("id,nombre,desde,hasta,ahorro_pct")
      .eq("tenant_id", tenantId).order("desde", { ascending: false }).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("operativos").select("*").eq("tenant_id", tenantId)
      .order("fecha").order("hora_inicio", { nullsFirst: false }).order("id").range(a, b)),
  ]);
  if (grupos.error || operativos.error) return <p role="alert" className="rounded-lg bg-red-50 p-4">No se pudieron cargar los chequeos. Recarga para reintentar.</p>;

  const chequeos = (grupos.data ?? []) as Chequeo[];
  const chequeo = chequeos.find(c => c.id === params.chequeo)
    ?? chequeos.find(c => c.desde <= hoy && c.hasta >= hoy) ?? chequeos[0];
  const sedes = (operativos.data ?? []) as SedeChequeo[];
  const cabecera = <CabeceraPagina seccion="Operativos" titulo="Chequeos" acciones={
    <>
      <Link href="/operativos" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Ver operativos</Link>
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
  if (!chequeo) return <div className="space-y-4">{cabecera}<p className="rounded-lg bg-white p-4">Crea un chequeo para juntar las sedes de un operativo.</p></div>;

  const integrantes = sedes.filter(s => s.chequeo_id === chequeo.id && s.estado !== "cancelado");
  const ids = integrantes.map(s => s.id);
  const lotes = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
  const [datos, gastos, tenant] = await Promise.all([
    Promise.all(lotes.map(lote => Promise.all([
      leerTodas((a, b) => supabase.from("recetas").select("id,operativo_id,paciente_id").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("ventas").select(
        `id,operativo_id,total,pagos_abonos(monto,medio_pago),
         venta_items(producto_id,cantidad,precio_unitario,descripcion,descuento,cristal_slot,
           ordenes_trabajo:ot_id(costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2,marco_propio,marco_propio_2,armazon_producto_id,armazon_producto_id_2),
           productos:producto_id(costo,categoria))`
      ).eq("tenant_id", tenantId).eq("anulada", false).in("operativo_id", lote).order("id").range(a, b)),
    ]))),
    leerTodas((a, b) => supabase.from("gastos_globales").select("id,fecha,descripcion,monto").eq("tenant_id", tenantId)
      .eq("chequeo_id", chequeo.id).order("fecha", { ascending: false }).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct,comision_credito_pct,reparto_etiquetas").eq("id", tenantId).single(),
  ]);
  const idsGastos = (gastos.data ?? []).map(g => g.id);
  const gruposGastos = [];
  for (let i = 0; i < idsGastos.length; i += 50) gruposGastos.push(idsGastos.slice(i, i + 50));
  const asignaciones = await Promise.all(gruposGastos.map(lote => leerTodas((a, b) => supabase.from("gastos_asignaciones")
    .select("id,gasto_id,operativo_id,clave,monto,anulado_en").eq("tenant_id", tenantId).in("gasto_id", lote)
    .is("anulado_en", null).order("id").range(a, b))));
  if (datos.some(lote => lote.some(res => res.error)) || gastos.error || tenant.error || asignaciones.some(res => res.error)) {
    return <div className="space-y-4">{cabecera}<p role="alert" className="rounded-lg bg-red-50 p-4">No se pudo calcular el chequeo. Recarga para reintentar.</p></div>;
  }

  const vinculados = asignaciones.flatMap(res => res.data ?? []);
  const gastosCompartidos = (gastos.data ?? []).reduce((suma, g) => suma + disponibleDeGasto(g, vinculados), 0);
  const n = resumirChequeo(integrantes, datos.flatMap(([r]) => r.data ?? []) as AtencionChequeo[],
    datos.flatMap(([, v]) => v.data ?? []) as unknown as VentaChequeo[], gastosCompartidos, Number(chequeo.ahorro_pct),
    Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0));
  const nombres = etiquetasReparto(tenant.data?.reparto_etiquetas);
  return <div className="mx-auto max-w-6xl space-y-5 pb-5">
    {cabecera}
    {chequeos.length > 1 && <form action={ruta} className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm font-semibold">Elegir chequeo
        <select name="chequeo" defaultValue={chequeo.id} className="rounded-lg border bg-white px-3 py-2">{chequeos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      </label>
      <button className="rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white">Ver</button>
    </form>}
    <section className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-xl font-bold">{chequeo.nombre}</h2>
        <p className="text-sm text-tinta-suave">{fechaLegible(chequeo.desde)} al {fechaLegible(chequeo.hasta)} · {n.filas.length} sedes</p>
      </div>
      <Link href={`${ruta}?chequeo=${chequeo.id}&modo=editar`} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Asignar sedes</Link>
    </section>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Recuadro etiqueta="Total vendido" valor={clp(n.vendido)} />
      <Recuadro etiqueta="Ya cobrado" valor={clp(n.cobrado)} />
      <Recuadro etiqueta="Falta cobrar" valor={clp(n.porCobrar)} destacado />
      <Recuadro etiqueta="Utilidad del chequeo" valor={clp(n.utilidad)} destacado />
      <Recuadro etiqueta="Pacientes atendidos" valor={n.pacientes} />
      <Recuadro etiqueta="Ventas de productos" valor={n.ventas} />
      <Recuadro etiqueta="Pares de lentes" valor={n.pares} />
      <Recuadro etiqueta="Marcos" valor={n.marcos} />
    </dl>
    <p className="text-sm text-tinta-suave">La utilidad descuenta costos y comisión de ventas, e incluye lo que aún falta cobrar.</p>
    <section aria-label="Sedes" className="space-y-2">
      <h2 className="text-lg font-bold">Por sede</h2>
      {!n.filas.length && <p className="rounded-lg bg-white p-4">Este chequeo todavía no tiene sedes asignadas.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{n.filas.map(f => (
        <li key={f.sede.id} className="grid gap-2 rounded-lg border border-tinta/15 bg-white p-3">
          <div><h3 className="font-bold">{f.sede.nombre}</h3>
          <p className="text-sm text-tinta-suave">{fechaLegible(f.sede.fecha)}{f.sede.direccion ? ` · ${f.sede.direccion}` : ""}</p></div>
          <p className="text-sm">{f.pacientes} atendidos · {f.ventas} ventas · {f.pares} pares · {f.marcos} marcos</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt>Cobrado</dt><dd className="font-semibold">{clp(f.cobrado)}</dd></div>
            <div><dt>Por cobrar</dt><dd className="font-semibold">{clp(f.porCobrar)}</dd></div>
            <div><dt>Utilidad de la sede</dt><dd className="font-semibold">{clp(f.utilidad)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-brand-dark">
            {f.conSaldo > 0 && <Link className="underline" href={`/cobros?op=${f.sede.id}&ver=deben`}>Ver a quién cobrar ({f.conSaldo})</Link>}
            <Link className="underline" href={`/operativos/${f.sede.id}/cierre`}>Gastos y reparto</Link>
          </div>
        </li>
      ))}</ul>
    </section>
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Gastos compartidos · {clp(n.gastosCompartidos)}</summary>
      {params.guardado === "1" && <p role="status" className="mt-2 text-sm text-emerald-800">Gasto guardado.</p>}
      {(gastos.data ?? []).map(g => <p key={g.id} className="mt-2 flex justify-between gap-2 text-sm"><span>{g.descripcion} · {fechaLegible(g.fecha)}</span><b>{clp(g.monto)}</b></p>)}
      <div className="mt-4 max-w-lg"><GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" chequeoId={chequeo.id} /></div>
    </details>
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Reparto estimado del chequeo</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Recuadro etiqueta={nombres.isadora} valor={clp(n.comisionVentas)} />
        <Recuadro etiqueta="Ahorro" valor={clp(n.reparto.ahorro)} />
        <Recuadro etiqueta={nombres.madre} valor={clp(n.reparto.parteMadre)} />
        <Recuadro etiqueta={nombres.pablo} valor={clp(n.reparto.partePablo)} />
      </dl>
    </details>
  </div>;
}
