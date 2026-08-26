import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, hoyEnChile, inicioDelDia } from "@/lib/fechas";

const ESTADOS_OT: Record<string, string> = {
  recepcion: "Recepción",
  laboratorio: "Laboratorio",
  montaje: "Montaje",
  listo: "Listo",
};

export default async function Dashboard() {
  const supabase = await createClient();

  const hoy = hoyEnChile();
  // inicioDelDia() da la medianoche EN CHILE, no en UTC: comparar con
  // toISOString() de un Date recién creado dejaba fuera todo lo vendido en
  // la tarde (pasadas las 20:00 en Santiago ya contaba como "mañana").
  const [ventasHoy, otsPendientes, inventario, proximoOperativo] = await Promise.all([
    supabase.from("ventas").select("total, estado_pago").gte("fecha", inicioDelDia(hoy)),
    supabase
      .from("ordenes_trabajo")
      .select("id, folio, estado, fecha_entrega_estimada, pacientes:paciente_id (nombre)")
      .neq("estado", "entregado")
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
  const proximo = proximoOperativo.data;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Hoy</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Ventas del día</p>
          <p className="mt-1 text-2xl font-bold">{clp(totalHoy)}</p>
          <p className="text-xs text-tinta-suave">{numVentasHoy} venta{numVentasHoy === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Entregas de hoy</p>
          <p className={`mt-1 text-2xl font-bold ${entregasHoy.length > 0 ? "text-brand-dark" : ""}`}>
            {entregasHoy.length}
          </p>
          <Link href="/ot" className="text-xs font-medium text-brand hover:underline">
            Ver tablero →
          </Link>
        </div>
        <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Stock crítico</p>
          <p className={`mt-1 text-2xl font-bold ${stockCritico.length > 0 ? "text-brand-dark" : ""}`}>
            {stockCritico.length}
          </p>
          <p className="text-xs text-tinta-suave">productos en o bajo mínimo</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Próximo operativo</p>
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
