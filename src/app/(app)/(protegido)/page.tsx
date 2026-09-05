import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import Tarjeta from "@/components/tarjeta";
import { fechaLegible, hoyEnChile, inicioDelDia } from "@/lib/fechas";

const ESTADOS_OT: Record<string, string> = {
  recepcion: "Recepción",
  laboratorio: "Laboratorio",
  montaje: "Montaje",
  listo: "Listo",
};

export default async function Dashboard() {
  const supabase = await createClient();

  // El rol "ventas" (vendedoras de mesón) solo necesita órdenes y ventas —
  // este panel muestra cifras de negocio (venta del día, stock) que no le
  // corresponden, así que se manda directo a lo suyo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfil?.rol === "ventas") redirect("/ventas");

  const hoy = hoyEnChile();
  // inicioDelDia() da la medianoche EN CHILE, no en UTC: comparar con
  // toISOString() de un Date recién creado dejaba fuera todo lo vendido en
  // la tarde (pasadas las 20:00 en Santiago ya contaba como "mañana").
  const [ventasHoy, otsPendientes, inventario, proximoOperativo] = await Promise.all([
    supabase.from("ventas").select("total, estado_pago").eq("anulada", false).gte("fecha", inicioDelDia(hoy)),
    supabase
      .from("ordenes_trabajo")
      .select(
        "id, folio, estado, fecha_entrega_estimada, origen_cristal, costo_laboratorio, costo_laboratorio_2, pacientes:paciente_id (nombre)"
      )
      // Una venta anulada cancela su OT — que no siga contando como
      // "pendiente" ni asomándose en "entregas de hoy".
      .not("estado", "in", "(entregado,cancelado)")
      .order("fecha_ingreso", { ascending: true }),
    supabase
      .from("inventario")
      .select("stock_actual, stock_minimo, productos:producto_id (nombre, marca)"),
    supabase
      .from("operativos")
      .select("id, nombre, fecha, direccion")
      .eq("estado", "planificado")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalHoy = (ventasHoy.data ?? []).reduce((s, v) => s + v.total, 0);
  const numVentasHoy = ventasHoy.data?.length ?? 0;
  const ots = otsPendientes.data ?? [];
  const entregasHoy = ots.filter((ot) => ot.fecha_entrega_estimada === hoy);
  const stockCritico = (inventario.data ?? []).filter((i) => i.stock_actual <= i.stock_minimo);
  // Lo que hay que llevar en plata la próxima vez que se manden a hacer
  // cristales: solo las OT recién recepcionadas (todavía no enviadas al
  // laboratorio) y que de verdad se piden afuera (no las que salen de
  // stock propio). costo_laboratorio ya es precio unitario × 2 + montaje +
  // IVA — exactamente lo que cobra el laboratorio por el par.
  const otsPorEnviar = ots.filter((ot) => ot.estado === "recepcion" && ot.origen_cristal === "laboratorio");
  const totalPorPagarLaboratorio = otsPorEnviar.reduce(
    (s, ot) => s + (ot.costo_laboratorio ?? 0) + (ot.costo_laboratorio_2 ?? 0),
    0
  );
  const proximo = proximoOperativo.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Hoy</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta
          icono="💰"
          titulo="Ventas del día"
          valor={clp(totalHoy)}
          detalle={`${numVentasHoy} venta${numVentasHoy === 1 ? "" : "s"}`}
        />
        <div className="relative overflow-hidden rounded-3xl bg-white p-4 shadow-[0_2px_10px_-3px_rgba(61,57,41,0.15)] transition hover:shadow-[0_8px_24px_-6px_rgba(61,57,41,0.22)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand to-accent" />
          <p className="flex items-center gap-1.5 text-sm text-tinta-suave">📦 Entregas de hoy</p>
          <p className={`mt-1 text-2xl font-bold ${entregasHoy.length > 0 ? "text-brand-dark" : "text-tinta"}`}>
            {entregasHoy.length}
          </p>
          <Link href="/ot" className="text-xs font-medium text-brand hover:underline">
            Ver tablero →
          </Link>
        </div>
        <Tarjeta
          icono="🔍"
          titulo="Stock crítico"
          valor={String(stockCritico.length)}
          detalle="productos en o bajo mínimo"
          acento={stockCritico.length > 0}
        />
        <Tarjeta
          icono="💵"
          titulo="Para pagar al laboratorio"
          valor={clp(totalPorPagarLaboratorio)}
          detalle={
            otsPorEnviar.length > 0
              ? `${otsPorEnviar.length} orden${otsPorEnviar.length === 1 ? "" : "es"} por enviar`
              : "Nada pendiente de enviar"
          }
          acento={totalPorPagarLaboratorio > 0}
        />
        <div className="relative overflow-hidden rounded-3xl bg-sky-50 p-4 shadow-[0_2px_10px_-3px_rgba(3,105,161,0.15)] transition hover:shadow-[0_8px_24px_-6px_rgba(3,105,161,0.22)]">
          <p className="text-sm text-sky-800">📅 Próximo operativo</p>
          {proximo ? (
            <>
              <p className="mt-1 truncate text-lg font-bold text-sky-950">{proximo.nombre}</p>
              <Link href={`/operativos/${proximo.id}`} className="text-xs font-medium text-sky-700 hover:underline">
                {fechaLegible(proximo.fecha)} →
              </Link>
            </>
          ) : (
            <p className="mt-1 text-sm text-sky-700">Ninguno planificado</p>
          )}
        </div>
      </div>

      {entregasHoy.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">📦 Entregas de hoy</h2>
          <ul className="flex flex-col gap-2">
            {entregasHoy.map((ot) => (
              <li key={ot.id} className="flex items-center gap-3 rounded-xl bg-brand/10 px-4 py-3">
                <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold text-brand-dark">
                  #{ot.folio}
                </span>
                <span className="flex-1 truncate text-sm font-medium">
                  {(ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—"}
                </span>
                <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-brand-dark">
                  {ESTADOS_OT[ot.estado] ?? ot.estado}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Órdenes de trabajo pendientes</h2>
        {ots.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            No hay órdenes pendientes. 🎉
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ots.slice(0, 8).map((ot) => (
              <li key={ot.id} className="flex items-center gap-3 rounded-xl bg-crema-claro px-4 py-3 shadow-sm">
                <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-dark">
                  #{ot.folio}
                </span>
                <span className="flex-1 truncate text-sm font-medium">
                  {(ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—"}
                </span>
                <span className="rounded-full bg-crema px-2.5 py-0.5 text-xs font-medium text-tinta-suave">
                  {ESTADOS_OT[ot.estado] ?? ot.estado}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {stockCritico.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">Alertas de stock</h2>
          <ul className="flex flex-col gap-2">
            {stockCritico.map((item, i) => {
              const p = item.productos as unknown as { nombre: string; marca: string | null } | null;
              return (
                <li key={i} className="flex items-center gap-3 rounded-xl bg-brand/10 px-4 py-3">
                  <span className="flex-1 text-sm font-medium">
                    {p?.marca ? `${p.marca} ` : ""}{p?.nombre ?? "Producto"}
                  </span>
                  <span className="text-sm font-bold text-brand-dark">
                    {item.stock_actual} / mín {item.stock_minimo}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
