import { mercadoPagoConfigurado } from "@/lib/mercadopago-sync";
import CabeceraPagina from "@/components/cabecera-pagina";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { avanzarOT, retrocederOT } from "@/lib/actions/ot";
import EliminarOT from "./eliminar-ot";
import { rutaAvisoEntrega } from "@/lib/avisos";
import { clp } from "@/lib/clp";
import { leerTodas } from "@/lib/leer-todas";
import { ordenDeCobroPorVenta, saldoUnicoPorVenta } from "@/lib/saldo-ordenes";
import { hoyEnChile, diaEnChile, fechaLegible } from "@/lib/fechas";
import AbonoForm from "@/components/abono-form";
import Tarjeta from "@/components/tarjeta";
import { paresOT, resumirFoliosOT, sedesDeOrden } from "@/lib/entregas";
import CopiarFolios from "./copiar-folios";

type SedeOT = {
  id: string;
  nombre: string;
  fecha: string;
  hora_inicio: string | null;
  fecha_entrega_estimada: string | null;
  estado: string;
};
type VentaOT = { ventaId: string; saldo: number; operativoId: string | null };

const COLUMNAS = [
  { estado: "recepcion", titulo: "Recepción", accion: "→ Laboratorio" },
  { estado: "laboratorio", titulo: "Laboratorio", accion: "→ Montaje" },
  { estado: "montaje", titulo: "Montaje", accion: "→ Listo" },
  { estado: "listo", titulo: "Listo", accion: "Entregar ✓" },
] as const;

export default async function TableroOT() {
  const supabase = await createClient();
  const [tenantRes, otsRes, sedesRes] = await Promise.all([
    supabase.from("tenants").select("id").maybeSingle(),
    leerTodas((a, b) => supabase
      .from("ordenes_trabajo")
      .select(
        "id, paciente_id, folio, estado, tipo_lente, tratamiento, posicion, tipo_lente_2, tratamiento_2, posicion_2, fecha_ingreso, fecha_entrega_estimada, operativo_id, recetas:receta_id(operativo_id), pacientes:paciente_id(nombre, telefono)"
      )
      .not("estado", "in", "(entregado,cancelado)")
      .order("fecha_ingreso").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("operativos").select("id,nombre,fecha,hora_inicio,fecha_entrega_estimada,estado")
      .order("fecha").order("hora_inicio", { nullsFirst: false }).order("id").range(a, b)),
  ]);
  if (otsRes.error || sedesRes.error) throw new Error("No se pudieron cargar las órdenes y sus operativos");
  const mercadoPago = mercadoPagoConfigurado(tenantRes.data?.id ?? "");
  const ots = otsRes.data ?? [];
  const sedes = new Map((sedesRes.data as SedeOT[]).map(sede => [sede.id, sede]));
  const hoy = hoyEnChile();

  const otIds = ots.map(ot => ot.id);
  const ventasPorOT = new Map<string, Map<string, VentaOT>>();
  for (let inicio = 0; inicio < otIds.length; inicio += 100) {
    const { data: items, error } = await leerTodas((a, b) => supabase
      .from("venta_items")
      .select("ot_id, ventas:venta_id!inner (id, total, operativo_id, pagos_abonos (monto))")
      .eq("ventas.anulada", false).in("ot_id", otIds.slice(inicio, inicio + 100)).order("id").range(a, b));
    if (error) throw new Error("No se pudo verificar la venta de las órdenes");

    for (const item of items ?? []) {
      const venta = item.ventas as unknown as { id: string; total: number; operativo_id: string | null; pagos_abonos: { monto: number }[] } | null;
      if (!venta || !item.ot_id) continue;
      const abonado = (venta.pagos_abonos ?? []).reduce((s, p) => s + p.monto, 0);
      const vinculadas = ventasPorOT.get(item.ot_id) ?? new Map<string, VentaOT>();
      vinculadas.set(venta.id, { ventaId: venta.id, saldo: venta.total - abonado, operativoId: venta.operativo_id });
      ventasPorOT.set(item.ot_id, vinculadas);
    }
  }

  const ventaPorOT = new Map<string, VentaOT>();
  const sedePorOT = new Map<string, SedeOT>();
  const sinSede: typeof ots = [];
  const revisarSede: typeof ots = [];
  const porSede = new Map<string, { sede: SedeOT; ordenes: typeof ots }>();
  for (const ot of ots) {
    const ventas = [...(ventasPorOT.get(ot.id)?.values() ?? [])];
    if (ventas.length === 1) ventaPorOT.set(ot.id, ventas[0]);
    const receta = ot.recetas as unknown as { operativo_id: string | null } | null;
    const ids = sedesDeOrden([ot.operativo_id, receta?.operativo_id, ...ventas.map(venta => venta.operativoId)]);
    const sede = sedes.get(ids[0]);
    if (ventas.length > 1 || ids.length > 1 || (ids.length && (!sede || sede.estado === "cancelado"))) {
      revisarSede.push(ot);
    } else if (sede) {
      sedePorOT.set(ot.id, sede);
      const grupo = porSede.get(sede.id) ?? { sede, ordenes: [] };
      grupo.ordenes.push(ot);
      porSede.set(sede.id, grupo);
    } else {
      sinSede.push(ot);
    }
  }

  function entregaSede(sede: SedeOT) {
    const fecha = sede.fecha_entrega_estimada;
    return fecha && fecha >= hoy ? fecha : "9999-12-31";
  }

  const grupos = [...porSede.values()].sort(({ sede: a }, { sede: b }) =>
    entregaSede(a).localeCompare(entregaSede(b)) || a.fecha.localeCompare(b.fecha)
    || (a.hora_inicio ?? "24:00").localeCompare(b.hora_inicio ?? "24:00") || a.nombre.localeCompare(b.nombre, "es"));
  const revisarIds = new Set(revisarSede.map(ot => ot.id));

  const porEstado = (estado: string) => ots.filter((o) => o.estado === estado);

  // Vistazo del tablero completo: cuántas están atrasadas y cuánto falta
  // por cobrar en total, sin tener que sumar tarjeta por tarjeta.
  const totalEnCurso = ots.length;
  const atrasadas = ots.filter(
    (ot) => ot.fecha_entrega_estimada && ot.fecha_entrega_estimada < hoy
  ).length;
  const totalPorCobrar = saldoUnicoPorVenta([...ventaPorOT.values()]);
  const ordenDeCobro = ordenDeCobroPorVenta(ots, ventaPorOT);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <CabeceraPagina seccion="Atención" titulo="Órdenes de trabajo" />
        <Link href="/ot/buscar" className="text-sm font-medium text-brand-dark hover:underline">
          Buscar historial
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tarjeta icono="📋" titulo="En curso" valor={String(totalEnCurso)} />
        <Tarjeta icono="⚠" titulo="Atrasadas" valor={String(atrasadas)} acento={atrasadas > 0} />
        <Tarjeta icono="💰" titulo="Por cobrar" valor={clp(totalPorCobrar)} acento={totalPorCobrar > 0} />
      </div>

      {ots.length > 0 && <section aria-labelledby="folios-operativo" className="space-y-3">
        <h2 id="folios-operativo" className="text-lg font-bold">OT pendientes por operativo</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {grupos.map(({ sede, ordenes }) => {
            const { primero, ultimo, folios } = resumirFoliosOT(ordenes.map(ot => ot.folio));
            const pares = ordenes.reduce((total, ot) => total + paresOT(ot), 0);
            const cantidad = `${ordenes.length} OT · ${pares} ${pares === 1 ? "par" : "pares"}`;
            return <li key={sede.id} className="rounded-xl border border-tinta/15 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <h3 className="font-bold">{sede.nombre}</h3>
                <span className="text-xs text-tinta-suave">
                  {sede.fecha_entrega_estimada ? `Entrega ${fechaLegible(sede.fecha_entrega_estimada)}` : `Operativo ${fechaLegible(sede.fecha)}`}
                </span>
              </div>
              <p className="mt-1 text-sm font-semibold tabular-nums">
                OT #{primero}{primero !== ultimo && ` a #${ultimo}`} · {cantidad}
              </p>
              <p className="mt-1 select-text text-sm tabular-nums"><b>Folios para las bolsas</b> · {folios}</p>
              <CopiarFolios sede={sede.nombre} texto={`${sede.nombre} · ${cantidad}\nFolios OT: ${folios}`} />
            </li>;
          })}
        </ul>
        {sinSede.length > 0 && <details className="rounded-lg bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Sin operativo asociado · {sinSede.length} OT</summary>
          <p className="mt-2 select-text tabular-nums">{resumirFoliosOT(sinSede.map(ot => ot.folio)).folios}</p>
        </details>}
        {revisarSede.length > 0 && <details className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <summary className="cursor-pointer font-semibold">Revisar operativo · {revisarSede.length} OT</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            {revisarSede.map(ot => <Link key={ot.id} href={`/ot/${ot.id}`} className="underline">OT #{ot.folio}</Link>)}
          </div>
        </details>}
      </section>}

      {/* Kanban: columnas con scroll horizontal en móvil/tablet (spec 8.3) */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNAS.map((col) => {
          const items = porEstado(col.estado);
          return (
            <section
              key={col.estado}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-3xl bg-crema-claro p-3 shadow-[0_2px_10px_-3px_rgba(61,57,41,0.12)]"
            >
              <header className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{col.titulo}</h2>
                <span className="rounded-full bg-crema px-2 py-0.5 text-xs font-semibold text-tinta-suave">
                  {items.length}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-tinta-suave/25 p-3 text-center text-xs text-tinta-suave">
                  Vacío
                </p>
              ) : (
                items.map((ot) => {
                  const atrasada =
                    ot.fecha_entrega_estimada &&
                    ot.fecha_entrega_estimada < hoy;
                  const paciente = ot.pacientes as unknown as { nombre: string; telefono: string | null } | null;
                  const venta = ventaPorOT.get(ot.id);
                  const saldo = venta?.saldo ?? 0;
                  const ordenPrincipal = venta && ordenDeCobro.get(venta.ventaId);
                  const muestraCobro = ordenPrincipal?.id === ot.id;
                  const sede = sedePorOT.get(ot.id);
                  const revisar = revisarIds.has(ot.id);
                  const rutaAviso = rutaAvisoEntrega(sede?.id, ot.paciente_id);
                  return (
                    <article
                      key={ot.id}
                      id={`ot-${ot.id}`}
                      className={`scroll-mt-20 rounded-2xl bg-white p-3 shadow-[0_2px_8px_-3px_rgba(61,57,41,0.15)] transition hover:shadow-[0_6px_18px_-4px_rgba(61,57,41,0.22)] target:outline-2 target:outline-brand ${
                        atrasada ? "ring-1 ring-red-200" : ""
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1">
                        <Link href={`/ot/${ot.id}`} className="text-xs font-bold text-brand-dark hover:underline">
                          #{ot.folio} 🖨
                        </Link>
                        {ot.fecha_entrega_estimada && (
                          <span className={`text-xs ${atrasada ? "font-bold text-red-600" : "text-tinta-suave"}`}>
                            Entrega {fechaLegible(ot.fecha_entrega_estimada)}
                            {atrasada ? " ⚠" : ""}
                          </span>
                        )}
                        <EliminarOT otId={ot.id} folio={ot.folio} compacto />
                      </div>
                      <p className="min-w-0 break-words text-sm font-medium">{paciente?.nombre ?? "—"}</p>
                      {sede && <p className="text-xs font-semibold text-brand-dark">{sede.nombre}</p>}
                      {revisar && <p className="text-xs font-semibold text-amber-800">Revisar operativo</p>}
                      <p className="truncate text-xs text-tinta-suave">
                        {[ot.tipo_lente, ot.posicion ? `(${ot.posicion})` : null, ot.tratamiento]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {(ot.tipo_lente_2 || ot.tratamiento_2) && (
                        <p className="truncate text-xs text-tinta-suave">
                          + {[ot.tipo_lente_2, ot.posicion_2 ? `(${ot.posicion_2})` : null, ot.tratamiento_2]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="text-xs text-tinta-suave">
                        Tomada el {fechaLegible(diaEnChile(ot.fecha_ingreso))}
                      </p>
                      {saldo > 0 && muestraCobro && (
                        <p className="mt-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          Saldo de la venta {clp(saldo)}
                        </p>
                      )}
                      {saldo > 0 && ordenPrincipal && !muestraCobro && (
                        <Link href={`#ot-${ordenPrincipal.id}`} className="mt-1 block text-xs font-semibold text-brand-dark underline">
                          Misma venta · cobro en OT #{ordenPrincipal.folio}
                        </Link>
                      )}
                      {col.estado === "listo" && venta && saldo > 0 && muestraCobro && (
                        <div className="mt-2">
                          <AbonoForm mercadoPago={mercadoPago} ventaId={venta.ventaId} saldo={saldo} compacto />
                        </div>
                      )}
                      {col.estado === "listo" && venta && saldo <= 0 && (
                        <Link
                          href={`/ventas/${venta.ventaId}/comprobante`}
                          className="mt-2 block w-full rounded-lg border border-tinta-suave/30 px-2 py-1.5 text-center text-xs font-medium text-tinta-suave transition hover:bg-crema"
                        >
                          🖨 Pagado — ver comprobante
                        </Link>
                      )}
                      {col.estado === "listo" && rutaAviso && (
                        <Link
                          href={rutaAviso}
                          className="mt-2 block w-full rounded-lg bg-green-600/10 px-2 py-1.5 text-center text-xs font-semibold text-green-700 transition hover:bg-green-600 hover:text-white"
                        >
                          💬 Preparar aviso de entrega
                        </Link>
                      )}
                      {col.estado === "listo" && !rutaAviso && !revisar && <p className="mt-2 text-xs text-amber-800">Esta orden no tiene operativo asociado. Revisa la venta para coordinar su entrega.</p>}
                      <div className="mt-2 flex gap-1.5">
                        {col.estado !== "recepcion" && (
                          <form action={retrocederOT}>
                            <input type="hidden" name="ot_id" value={ot.id} />
                            <input type="hidden" name="estado_actual" value={ot.estado} />
                            <button
                              className="rounded-lg border border-tinta-suave/30 px-2 py-1.5 text-xs font-medium text-tinta-suave transition hover:bg-crema"
                              aria-label="Volver una columna atrás"
                              title="Volver una columna atrás"
                            >
                              ‹
                            </button>
                          </form>
                        )}
                        <form action={avanzarOT} className="flex-1">
                          <input type="hidden" name="ot_id" value={ot.id} />
                          <input type="hidden" name="estado_actual" value={ot.estado} />
                          <button className="w-full rounded-lg bg-brand/10 px-2 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                            {col.accion}
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
