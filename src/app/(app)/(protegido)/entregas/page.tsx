import CabeceraPagina from "@/components/cabecera-pagina";
import Link from "next/link";
import { exigirRolPagina } from "@/lib/autorizacion";
import { clp } from "@/lib/clp";
import { ESTADOS_ENTREGA, ordenarPedidosPorSede, paresOT, sedesDeOrden, type EstadoOTEntrega } from "@/lib/entregas";
import { diaEnChile, fechaConDia, fechaLegible } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import TarjetaCobro, { type FilaCobro } from "../cobros/tarjeta-cobro";

type Relacion<T> = T | T[] | null;
type Paciente = { nombre: string; telefono: string | null };
type Orden = EstadoOTEntrega & {
  id: string;
  folio: number;
  fecha_ingreso: string;
  operativo_id: string | null;
  recetas: Relacion<{ operativo_id: string | null }>;
  pacientes: Relacion<Paciente>;
  venta_items: { venta_id: string }[];
};
type Venta = {
  id: string;
  total: number;
  operativo_id: string | null;
  pacientes: Relacion<Paciente>;
  pagos_abonos: { monto: number }[];
  venta_items: { ot_id: string | null; ordenes_trabajo: Relacion<EstadoOTEntrega> }[];
};
type Operativo = {
  id: string;
  nombre: string;
  fecha: string;
  chequeo_id: string | null;
  fecha_entrega_estimada: string | null;
  hora_entrega: string | null;
  lugar_entrega: string | null;
  direccion: string | null;
  estado: string;
};
type Chequeo = { id: string; nombre: string; desde: string; hasta: string };
type OrdenRevisada = { ot: Orden; operativoId: string | null; sedes: string[]; problema: string | null };
type Revision = { ordenes: Orden[]; sedes: string[]; problema: string; venta?: Venta };

function uno<T>(relacion: Relacion<T>) {
  return Array.isArray(relacion) ? (relacion[0] ?? null) : relacion;
}

function cantidad(n: number, singular: string, plural = singular + "s") {
  return `${n} ${n === 1 ? singular : plural}`;
}

function sumar(filas: FilaCobro[]) {
  return filas.reduce((total, fila) => ({
    listos: total.listos + fila.listos,
    enProceso: total.enProceso + fila.enProceso,
    saldo: total.saldo + fila.saldo,
  }), { listos: 0, enProceso: 0, saldo: 0 });
}

function CargaFallida() {
  return <>
    <CabeceraPagina seccion="Operación" titulo="Entregas" />
    <p role="alert" className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
      No se pudieron cargar las entregas. Recarga para reintentar.
    </p>
  </>;
}

export default async function Entregas({ searchParams }: {
  searchParams: Promise<{ chequeo?: string; op?: string }>;
}) {
  const { supabase, tenantId } = await exigirRolPagina(["admin", "ventas"]);
  const { chequeo: chequeoId, op: operativoId } = await searchParams;
  const [ots, ops, chequeos] = await Promise.all([
    leerTodas((a, b) => supabase.from("ordenes_trabajo")
      .select("id,folio,estado,tipo_lente,tipo_lente_2,fecha_ingreso,operativo_id,recetas:receta_id(operativo_id),pacientes:paciente_id(nombre,telefono),venta_items(venta_id)")
      .eq("tenant_id", tenantId).not("estado", "in", "(entregado,cancelado)").order("folio").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("operativos")
      .select("id,nombre,fecha,chequeo_id,fecha_entrega_estimada,hora_entrega,lugar_entrega,direccion,estado")
      .eq("tenant_id", tenantId).order("fecha").order("hora_inicio", { nullsFirst: false }).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("chequeos").select("id,nombre,desde,hasta")
      .eq("tenant_id", tenantId).order("desde", { ascending: false }).order("id").range(a, b)),
  ]);
  if (ots.error || ops.error || chequeos.error) return <CargaFallida />;

  const ordenes = ots.data as Orden[];
  const sedes = ops.data as Operativo[];
  const chequeo = (chequeos.data as Chequeo[]).find(c => c.id === chequeoId);
  const sedeSeleccionada = sedes.find(s => s.id === operativoId && (!chequeoId || s.chequeo_id === chequeo?.id));
  if ((chequeoId && !chequeo) || (operativoId && !sedeSeleccionada)) {
    return <p>Este grupo de entregas no está disponible. <Link className="underline" href="/entregas">Ver todas</Link></p>;
  }

  const ventasIds = [...new Set(ordenes.flatMap(ot => ot.venta_items.map(item => item.venta_id)))];
  const lotes = [];
  for (let i = 0; i < ventasIds.length; i += 100) lotes.push(ventasIds.slice(i, i + 100));
  const resultados = await Promise.all(lotes.map(ids => leerTodas((a, b) => supabase.from("ventas")
    .select("id,total,operativo_id,pacientes:paciente_id(nombre,telefono),pagos_abonos(monto),venta_items(ot_id,ordenes_trabajo:ot_id(estado,tipo_lente,tipo_lente_2))")
    .eq("tenant_id", tenantId).eq("anulada", false).in("id", ids).order("id").range(a, b))));
  if (resultados.some(res => res.error)) return <CargaFallida />;

  const ventas = resultados.flatMap(res => res.data ?? []) as Venta[];
  const sedesPorId = new Map(sedes.map(sede => [sede.id, sede]));
  const ventasPorId = new Map(ventas.map(venta => [venta.id, venta]));
  const ordenesPorVenta = new Map<string, OrdenRevisada[]>();
  const porRevisar: Revision[] = [];
  const otsConVentaAmbigua = new Set<string>();

  for (const ot of ordenes) {
    const idsVenta = [...new Set(ot.venta_items.map(item => item.venta_id))].filter(id => ventasPorId.has(id));
    const referencias = [ot.operativo_id, uno(ot.recetas)?.operativo_id, ...idsVenta.map(id => ventasPorId.get(id)?.operativo_id)];
    const sedesOT = sedesDeOrden(referencias);
    const [sede] = sedesOT;
    if (idsVenta.length !== 1) {
      if (idsVenta.length > 1) otsConVentaAmbigua.add(ot.id);
      porRevisar.push({
        ordenes: [ot],
        sedes: sedesOT,
        problema: idsVenta.length > 1 ? "La OT está vinculada a más de una venta activa." : "La OT no tiene una venta activa vinculada.",
      });
      continue;
    }
    const problema = sedesOT.length > 1 ? "La sede difiere entre la OT, la venta o la receta."
      : sede && (!sedesPorId.has(sede) || sedesPorId.get(sede)?.estado === "cancelado") ? "La sede registrada no está disponible." : null;
    const idVenta = idsVenta[0];
    const vinculadas = ordenesPorVenta.get(idVenta) ?? [];
    vinculadas.push({ ot, operativoId: sede ?? null, sedes: sedesOT, problema });
    ordenesPorVenta.set(idVenta, vinculadas);
  }

  const filasPorSede = new Map<string | null, FilaCobro[]>();
  for (const venta of ventas) {
    const vinculadas = ordenesPorVenta.get(venta.id) ?? [];
    if (!vinculadas.length) continue;
    const { sede, sedes: referencias, problema } = ordenarPedidosPorSede(vinculadas);
    const tieneOrdenAmbigua = venta.venta_items.some(item => item.ot_id && otsConVentaAmbigua.has(item.ot_id));
    const otsVenta = vinculadas.map(v => v.ot);
    if (problema || tieneOrdenAmbigua) {
      porRevisar.push({ ordenes: otsVenta, sedes: referencias, problema: problema ?? "El pedido comparte una OT con otra venta.", venta });
      continue;
    }
    const persona = uno(venta.pacientes);
    const pagado = venta.pagos_abonos.reduce((total, pago) => total + pago.monto, 0);
    const listos = otsVenta.filter(ot => ot.estado === "listo").reduce((total, ot) => total + paresOT(ot), 0);
    const entregadas = new Map<string, EstadoOTEntrega>();
    for (const item of venta.venta_items) {
      const ot = uno(item.ordenes_trabajo);
      if (item.ot_id && ot?.estado === "entregado") entregadas.set(item.ot_id, ot);
    }
    const filas = filasPorSede.get(sede) ?? [];
    filas.push({
      ventaId: venta.id, nombre: persona?.nombre ?? "Sin paciente", telefono: persona?.telefono ?? null,
      total: venta.total, pagado, saldo: Math.max(0, venta.total - pagado), listos,
      enProceso: otsVenta.reduce((total, ot) => total + paresOT(ot), 0) - listos,
      entregados: [...entregadas.values()].reduce((total, ot) => total + paresOT(ot), 0),
      ordenes: otsVenta.map(ot => ({ id: ot.id, folio: ot.folio, pares: paresOT(ot), estado: ESTADOS_ENTREGA[ot.estado] ?? ot.estado })),
    });
    filasPorSede.set(sede, filas);
  }

  const enVista = sedes.filter(sede => sedeSeleccionada ? sede.id === sedeSeleccionada.id
    : chequeo ? sede.chequeo_id === chequeo.id && sede.estado !== "cancelado" : filasPorSede.has(sede.id));
  const idsEnVista = new Set(enVista.map(sede => sede.id));
  const revisiones = porRevisar.filter(revision => {
    if (!chequeo && !sedeSeleccionada) return true;
    if (revision.sedes.length || sedeSeleccionada) return revision.sedes.some(id => idsEnVista.has(id));
    return chequeo && revision.ordenes.some(ot => {
      const dia = diaEnChile(ot.fecha_ingreso);
      return dia >= chequeo.desde && dia <= chequeo.hasta;
    });
  });
  const fechas = [...new Set(enVista.flatMap(sede => sede.fecha_entrega_estimada ?? []))].sort();
  const fechasConSedes = [...fechas, null].map(fecha => ({
    fecha, sedes: enVista.filter(sede => sede.fecha_entrega_estimada === fecha),
  })).filter(grupo => grupo.sedes.length);
  const sinOperativo = !chequeo && !sedeSeleccionada ? filasPorSede.get(null) ?? [] : [];
  const filasVisibles = [...enVista.flatMap(sede => filasPorSede.get(sede.id) ?? []), ...sinOperativo];
  const total = sumar(filasVisibles);

  function pedidos(filas: FilaCobro[]) {
    return filas.length > 0 && <ul className="mt-3 grid gap-2 lg:grid-cols-2">
      {[...filas].sort((a, b) => Number(b.listos > 0) - Number(a.listos > 0) || a.nombre.localeCompare(b.nombre, "es"))
        .map(fila => <TarjetaCobro key={fila.ventaId} fila={fila} />)}
    </ul>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <CabeceraPagina seccion="Operación" titulo={chequeo ? `Entregas · ${chequeo.nombre}` : "Entregas"} acciones={
        <>
          <Link href="/inventario/compras" className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold">Comprar marcos</Link>
          <Link href="/avisos" className="rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white">
            Avisar que están listos
          </Link>
        </>
      } />
      {Boolean(chequeos.data?.length || sedeSeleccionada) && (
        <nav aria-label="Filtrar entregas por chequeo" className="flex flex-wrap gap-2">
          {[{ href: "/entregas", nombre: "Todas", activo: !chequeo && !sedeSeleccionada },
            ...(chequeos.data ?? []).map(c => ({ href: `/entregas?chequeo=${c.id}`, nombre: c.nombre, activo: c.id === chequeo?.id && !sedeSeleccionada })),
          ].map(filtro => <Link key={filtro.href} href={filtro.href} aria-current={filtro.activo ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filtro.activo ? "border-brand bg-brand/10 text-brand-dark" : "bg-white"}`}>
            {filtro.nombre}
          </Link>)}
        </nav>
      )}
      <p className="rounded-xl bg-white p-3 text-sm tabular-nums">
        <b>{cantidad(filasVisibles.length, "pedido")} · {cantidad(total.listos + total.enProceso, "par", "pares")}</b>
        {" · "}{cantidad(total.listos, "listo")} · {total.enProceso} en proceso · {clp(total.saldo)} por cobrar
      </p>
      {fechasConSedes.map(grupo => (
        <section key={grupo.fecha ?? "por-coordinar"} className="space-y-2">
          <h2 className="text-lg font-bold">
            {grupo.fecha ? `Entrega planificada · ${fechaConDia(grupo.fecha)}` : "Fecha de entrega por coordinar"}
          </h2>
          {grupo.sedes.map(sede => {
            const filas = filasPorSede.get(sede.id) ?? [];
            const { listos, enProceso, saldo } = sumar(filas);
            const ubicacion = [
              sede.hora_entrega ?? (grupo.fecha ? "Hora por confirmar" : null),
              sede.lugar_entrega ?? (sede.direccion ? `Sede en ${sede.direccion}` : null),
            ].filter(Boolean).join(" · ");
            return <details key={sede.id} id={`sede-${sede.id}`} open={sedeSeleccionada?.id === sede.id || undefined}
              className="scroll-mt-32 rounded-2xl border border-tinta/15 bg-crema-claro p-3 sm:p-4">
              <summary className="cursor-pointer">
                <span className="font-bold">{sede.nombre}</span>
                <span className="ml-2 text-xs text-tinta-suave">Operativo {fechaLegible(sede.fecha)}{ubicacion && ` · ${ubicacion}`}</span>
                <span className="mt-1 block text-sm">
                  {filas.length ? <>
                    {cantidad(filas.length, "pedido")} · {cantidad(listos + enProceso, "par", "pares")} · <b>{cantidad(listos, "par listo", "pares listos")}</b> · {enProceso} en proceso · {clp(saldo)} por cobrar
                  </> : "Sin pedidos pendientes registrados"}
                </span>
              </summary>
              <Link href={`/avisos?op=${sede.id}`} className="mt-2 inline-block text-sm font-semibold text-brand-dark underline">
                Coordinar fecha, hora y lugar
              </Link>
              {pedidos(filas)}
            </details>;
          })}
        </section>
      ))}
      {sinOperativo.length > 0 && <section><h2 className="text-lg font-bold">Pedidos sin operativo</h2>{pedidos(sinOperativo)}</section>}
      {revisiones.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="font-bold text-amber-950">Órdenes por revisar</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {revisiones.map(({ ordenes, sedes: referencias, problema, venta }) => (
            <li key={venta?.id ?? ordenes[0].id} className="rounded-lg bg-white p-3">
              <p className="font-semibold">{uno(ordenes[0].pacientes)?.nombre ?? "Sin paciente"} · {problema}</p>
              {referencias.length > 0 && <p>{referencias.map(id => sedesPorId.get(id)?.nombre ?? "Sede desconocida").join(" / ")}</p>}
              <div className="flex flex-wrap gap-3">
                {ordenes.map(ot => <Link key={ot.id} href={`/ot/${ot.id}`} className="underline">OT #{ot.folio}</Link>)}
                {venta && <Link href={`/ventas/${venta.id}`} className="underline">Ver venta</Link>}
              </div>
            </li>
          ))}
        </ul>
      </section>}
      {fechasConSedes.length === 0 && sinOperativo.length === 0 && revisiones.length === 0
        && <p className="rounded-2xl bg-white p-6 text-center font-semibold">Sin entregas pendientes</p>}
    </div>
  );
}
