import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import { GastoGeneralForm } from "@/components/registro-gasto";
import { gastoDeResultado, resumirCajaChequeo } from "@/lib/caja-chequeo";
import { exigirRolPagina } from "@/lib/autorizacion";
import { resumirChequeo, type AtencionChequeo, type Chequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { clp } from "@/lib/clp";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import ActualizarCaja from "./actualizar-caja";
import FormularioChequeo from "./formulario";
import PersonasDeSede from "./personas-de-sede";

const ruta = "/operativos/chequeos";
const columnasGasto = "id,fecha,descripcion,monto,caja,categoria,operativo_id,chequeo_id,nota,monto_estimado";
const columnasAsignacion = "id,gasto_id,operativo_id,clave,monto,anulado_en";

function lotesDe(ids: string[]) {
  const lotes = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
  return lotes;
}

function Recuadro({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: number | string; destacado?: boolean }) {
  return <div className={`min-w-0 rounded-lg border px-3 py-3 sm:p-4 ${destacado ? "border-sky-800 bg-sky-950 text-white" : "border-tinta/15 bg-white"}`}>
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
    leerTodas((a, b) => supabase.from("chequeos").select("id,nombre,desde,hasta,ahorro_pct")
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
  const lotes = lotesDe(integrantes.map(s => s.id));
  const [datos, gastos, tenant] = await Promise.all([
    Promise.all(lotes.map(lote => Promise.all([
      leerTodas((a, b) => supabase.from("recetas").select("id,operativo_id,paciente_id").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("ventas").select(
        `id,operativo_id,total,pagos_abonos(monto,medio_pago),
         venta_items(producto_id,cantidad,precio_unitario,descripcion,descuento,cristal_slot,
           ordenes_trabajo:ot_id(estado,costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2,marco_propio,marco_propio_2,armazon_producto_id,armazon_producto_id_2),
           productos:producto_id(costo,categoria))`
      ).eq("tenant_id", tenantId).eq("anulada", false).in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_globales").select(columnasGasto).eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_asignaciones").select(columnasAsignacion).eq("tenant_id", tenantId)
        .in("operativo_id", lote).is("anulado_en", null).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("retiros_sueldo").select("id,persona,monto").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
    ]))),
    leerTodas((a, b) => supabase.from("gastos_globales").select(columnasGasto).eq("tenant_id", tenantId)
      .eq("chequeo_id", chequeo.id).order("fecha", { ascending: false }).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct,comision_credito_pct,reparto_etiquetas").eq("id", tenantId).single(),
  ]);
  const compartidos = gastos.data ?? [];
  const directos = datos.flatMap(([, , g]) => g.data ?? []);
  const asignacionesLocales = datos.flatMap(([, , , a]) => a.data ?? []);
  const retiros = datos.flatMap(([, , , , r]) => r.data ?? []);
  const propios = [...compartidos, ...directos];
  const idsPropios = new Set(propios.map(g => g.id));
  const externos = [...new Set(asignacionesLocales.map(a => a.gasto_id).filter(id => !idsPropios.has(id)))];
  const lotesGasto = lotesDe([...idsPropios, ...externos]);
  const [asignaciones, devoluciones, gastosExternos] = await Promise.all([
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("gastos_asignaciones")
      .select(columnasAsignacion).eq("tenant_id", tenantId).in("gasto_id", lote).is("anulado_en", null).order("id").range(a, b)))),
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("caja_movimientos")
      .select("id,gasto_id,monto").eq("tenant_id", tenantId).eq("tipo", "devolucion").in("gasto_id", lote).order("id").range(a, b)))),
    Promise.all(lotesDe(externos).map(lote => leerTodas((a, b) => supabase.from("gastos_globales")
      .select(columnasGasto).eq("tenant_id", tenantId).in("id", lote).order("id").range(a, b)))),
  ]);
  if (datos.some(lote => lote.some(res => res.error)) || gastos.error || tenant.error
      || [...asignaciones, ...devoluciones, ...gastosExternos].some(res => res.error)) {
    return <div className="space-y-4">{cabecera}<p role="alert" className="rounded-lg bg-red-50 p-4">No se pudo calcular el chequeo. Recarga para reintentar.</p></div>;
  }

  const vinculados = asignaciones.flatMap(res => res.data ?? []);
  const gastosCompartidos = compartidos.reduce((suma, g) => suma + gastoDeResultado(g, vinculados), 0);
  const n = resumirChequeo(integrantes, datos.flatMap(([r]) => r.data ?? []) as AtencionChequeo[],
    datos.flatMap(([, v]) => v.data ?? []) as unknown as VentaChequeo[], gastosCompartidos, Number(chequeo.ahorro_pct),
    Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0));
  const caja = resumirCajaChequeo(n, chequeo.id, [...propios, ...gastosExternos.flatMap(res => res.data ?? [])],
    vinculados, devoluciones.flatMap(res => res.data ?? []), retiros);
  const nombres = etiquetasReparto(tenant.data?.reparto_etiquetas);
  return <div className="mx-auto max-w-6xl space-y-5 pb-5">
    {cabecera}
    <ActualizarCaja />
    <section className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-xl font-bold">{chequeo.nombre}</h2>
        <p className="text-sm text-tinta-suave">{fechaLegible(chequeo.desde)} al {fechaLegible(chequeo.hasta)} · {n.filas.length} sedes</p>
      </div>
      <Link href={`${ruta}?chequeo=${chequeo.id}&modo=editar`} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Asignar sedes</Link>
    </section>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Recuadro etiqueta="Total vendido" valor={clp(n.vendido)} />
      <Recuadro etiqueta="Ya cobrado" valor={clp(n.cobrado)} />
      <Recuadro etiqueta="Cobrar al entregar" valor={clp(n.porCobrarEntrega)} destacado />
      <Recuadro etiqueta="Utilidad estimada" valor={clp(n.utilidad)} destacado />
      <Recuadro etiqueta="Pacientes atendidos" valor={n.pacientes} />
      <Recuadro etiqueta="Ventas de productos" valor={n.ventas} />
      <Recuadro etiqueta="Pares de lentes" valor={n.pares} />
      <Recuadro etiqueta="Marcos" valor={n.marcos} />
    </dl>
    {n.porCobrar > n.porCobrarEntrega && <p className="text-sm">Otros saldos por cobrar · {clp(n.porCobrar - n.porCobrarEntrega)}</p>}
    <section aria-label="Caja del chequeo" className="space-y-3">
      <h2 className="text-lg font-bold">Caja del chequeo</h2>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Recuadro etiqueta="Caja registrada" valor={clp(caja.cajaRegistrada)} />
        <Recuadro etiqueta="Queda tras pagar" valor={clp(caja.saldoTrasPagos)} destacado />
        <Recuadro etiqueta="Quedaría tras cobrar todo" valor={clp(caja.proyectado)} />
      </dl>
      <p className="text-sm text-tinta-suave">Incluye la comisión de tarjeta estimada y los gastos ingresados. Saldo del chequeo antes de ahorro y reparto. La utilidad estima el resultado de todas las ventas y descuenta el costo de los marcos usados.</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Recuadro etiqueta="Cristales" valor={clp(caja.cristales)} />
        <Recuadro etiqueta="Marcos usados (estimado)" valor={clp(caja.marcos)} />
        <Recuadro etiqueta="Comida registrada" valor={caja.comida ? clp(caja.comida) : "Sin registrar"} />
        <Recuadro etiqueta="Gastos y reintegros pagados" valor={clp(caja.salidas)} />
        <Recuadro etiqueta="Por pagar al laboratorio" valor={clp(caja.fidesPendiente)} />
        <Recuadro etiqueta="Otros gastos por pagar" valor={clp(caja.terrenoPendiente)} />
        <Recuadro etiqueta="Comisión de venta pendiente" valor={clp(caja.comisionPendiente)} />
        <Recuadro etiqueta="Reembolsos por pagar" valor={clp(caja.porReembolsar)} />
      </dl>
      {caja.adelantos.length > 0 && <div className="rounded-lg border border-tinta/15 bg-white p-3">
        <h3 className="font-semibold">Devoluciones pendientes</h3>
        <ul className="space-y-1 text-sm">{caja.adelantos.map(({ gasto, saldo }) => <li key={gasto.id}>
          <div className="flex justify-between gap-2"><span>{gasto.descripcion}{gasto.monto_estimado ? " (estimado)" : ""}</span><b>{clp(saldo)}</b></div>
          {gasto.nota && <p className="text-tinta-suave">{gasto.nota}</p>}
        </li>)}</ul>
        <Link href="/gastos#adelantos-personales" className="mt-2 inline-block text-sm text-brand-dark underline">Ver adelantos y devolver al pagar</Link>
      </div>}
    </section>
    <section aria-label="Sedes" className="space-y-2">
      <h2 className="text-lg font-bold">Por sede</h2>
      {!n.filas.length && <p className="rounded-lg bg-white p-4">Este chequeo todavía no tiene sedes asignadas.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{n.filas.map(f => (
        <li key={f.sede.id} className="grid gap-2 rounded-lg border border-tinta/15 bg-white p-3">
          <Link href={`${ruta}?chequeo=${chequeo.id}&sede=${f.sede.id}`} className="block rounded-md hover:bg-crema-claro">
            <h3 className="font-bold text-brand-dark underline">{f.sede.nombre}</h3>
            <p className="text-sm text-tinta-suave">{fechaLegible(f.sede.fecha)}{f.sede.direccion ? ` · ${f.sede.direccion}` : ""}</p>
            <span className="text-sm text-brand-dark">Ver personas y compras</span>
          </Link>
          <p className="text-sm">{f.pacientes} atendidos · {f.ventas} ventas · {f.pares} pares · {f.marcos} marcos</p>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt>Cobrado</dt><dd className="font-semibold">{clp(f.cobrado)}</dd></div>
            <div><dt>Por cobrar</dt><dd className="font-semibold">{clp(f.porCobrar)}</dd></div>
            <div><dt>Cristales</dt><dd className="font-semibold">{clp(f.desglose.totalCristales)}</dd></div>
            <div><dt>Marcos estimados</dt><dd className="font-semibold">{clp(f.desglose.totalArmazones)}</dd></div>
            <div><dt>Utilidad de la sede</dt><dd className="font-semibold">{clp(f.utilidad)}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-3 text-sm font-semibold text-brand-dark">
            {f.conSaldo > 0 && <Link className="underline" href={`/cobros?op=${f.sede.id}&ver=deben`}>Ver a quién cobrar ({f.conSaldo})</Link>}
            <Link className="underline" href={`/operativos/${f.sede.id}/cierre`}>Gastos y reparto</Link>
          </div>
        </li>
      ))}</ul>
    </section>
    {params.guardado === "1" && <p role="status" className="text-sm text-emerald-800">Gasto guardado.</p>}
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Registrar comida</summary>
      <div className="mt-4 max-w-lg"><GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" chequeoId={chequeo.id} comida /></div>
    </details>
    <details open={params.guardado === "1" ? true : undefined} className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Gastos compartidos · {clp(n.gastosCompartidos)}</summary>
      {compartidos.filter(g => g.categoria !== "compra_inventario").map(g => <p key={g.id} className="mt-2 flex justify-between gap-2 text-sm"><span>{g.descripcion} · {fechaLegible(g.fecha)}</span><b>{clp(g.monto)}</b></p>)}
      <div className="mt-4 max-w-lg"><GastoGeneralForm hoy={hoy} digital="Cuenta de la óptica" personal="Dinero personal" chequeoId={chequeo.id} /></div>
    </details>
    <details className="rounded-lg border border-tinta/15 bg-white p-4">
      <summary className="cursor-pointer font-semibold">Reparto pendiente estimado</summary>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Recuadro etiqueta={nombres.isadora} valor={clp(caja.comisionPendiente)} />
        <Recuadro etiqueta="Ahorro" valor={clp(caja.repartoPendiente.ahorro)} />
        <Recuadro etiqueta={nombres.madre} valor={clp(caja.repartoPendiente.madre)} />
        <Recuadro etiqueta={nombres.pablo} valor={clp(caja.repartoPendiente.pablo)} />
      </dl>
    </details>
  </div>;
}
