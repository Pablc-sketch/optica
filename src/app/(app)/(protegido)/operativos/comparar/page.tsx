import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible } from "@/lib/fechas";
import { costoDeItems, type ItemConCosto } from "@/lib/costo-venta";

// Ranking de operativos: para decidir dónde conviene repetir (mejor venta,
// mejor conversión, mejor utilidad) en vez de guiarse por sensación. Mismos
// datos que el detalle de cada operativo, pero todos juntos y comparables.

const TIPOS_VENUE: Record<string, string> = {
  condominio: "Condominio",
  junta_vecinos: "Junta de vecinos",
  apr: "APR",
  colegio: "Colegio",
  sala_cuna: "Sala cuna",
  supermercado: "Supermercado",
  otro: "Otro",
};

export default async function CompararOperativos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfilRes.data?.rol !== "admin") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Comparar operativos</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica ve esta comparación.
        </p>
      </div>
    );
  }

  const [{ data: operativos }, { data: recetas }, { data: ventas }] = await Promise.all([
    supabase
      .from("operativos")
      .select(
        "id, nombre, tipo_venue, fecha, estado, costo_transporte, costo_arriendo, costo_viaticos, costo_otros"
      )
      .neq("estado", "cancelado")
      .order("fecha", { ascending: false }),
    supabase.from("recetas").select("operativo_id").not("operativo_id", "is", null),
    supabase
      .from("ventas")
      .select(
        `operativo_id, total,
         venta_items (cantidad, cristal_slot, ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2), productos:producto_id (costo, categoria))`
      )
      .eq("anulada", false)
      .not("operativo_id", "is", null),
  ]);

  const examenesPorOperativo = new Map<string, number>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id) continue;
    examenesPorOperativo.set(r.operativo_id, (examenesPorOperativo.get(r.operativo_id) ?? 0) + 1);
  }
  const ventasPorOperativo = new Map<string, { cantidad: number; total: number; costoProductos: number }>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    const actual = ventasPorOperativo.get(v.operativo_id) ?? { cantidad: 0, total: 0, costoProductos: 0 };
    actual.cantidad += 1;
    actual.total += v.total;
    actual.costoProductos += costoDeItems((v.venta_items ?? []) as unknown as ItemConCosto[]);
    ventasPorOperativo.set(v.operativo_id, actual);
  }

  const filas = (operativos ?? []).map((o) => {
    const examenes = examenesPorOperativo.get(o.id) ?? 0;
    const venta = ventasPorOperativo.get(o.id) ?? { cantidad: 0, total: 0, costoProductos: 0 };
    // Costo real de lo vendido en este operativo, no solo sus propios
    // gastos (transporte, arriendo, etc) — si no, "utilidad" quedaba igual
    // a "vendido".
    const costos = o.costo_transporte + o.costo_arriendo + o.costo_viaticos + o.costo_otros + venta.costoProductos;
    const conversion = examenes > 0 ? (venta.cantidad / examenes) * 100 : 0;
    return {
      ...o,
      examenes,
      ventasCantidad: venta.cantidad,
      vendido: venta.total,
      costos,
      utilidad: venta.total - costos,
      conversion,
    };
  });

  const filasOrdenadas = [...filas].sort((a, b) => b.utilidad - a.utilidad);

  // Agrupado por tipo de lugar: promedio de venta y conversión, para
  // decidir en qué tipo de lugar conviene insistir.
  const porTipo = new Map<
    string,
    { cantidad: number; examenes: number; ventas: number; vendido: number; utilidad: number }
  >();
  for (const f of filas) {
    const clave = f.tipo_venue ?? "otro";
    const actual = porTipo.get(clave) ?? { cantidad: 0, examenes: 0, ventas: 0, vendido: 0, utilidad: 0 };
    actual.cantidad += 1;
    actual.examenes += f.examenes;
    actual.ventas += f.ventasCantidad;
    actual.vendido += f.vendido;
    actual.utilidad += f.utilidad;
    porTipo.set(clave, actual);
  }
  const tiposOrdenados = [...porTipo.entries()].sort((a, b) => b[1].utilidad - a[1].utilidad);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/operativos" className="text-xs font-medium text-sky-700 hover:underline">
          ← Todos los operativos
        </Link>
        <h1 className="mt-1 text-xl font-bold">Comparar operativos</h1>
        <p className="text-sm text-tinta-suave">
          Ordenados por utilidad neta, para ver de un vistazo dónde conviene repetir.
        </p>
      </div>

      {tiposOrdenados.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Por tipo de lugar</h2>
          <div className="overflow-x-auto rounded-2xl bg-sky-50 shadow-sm">
            <table className="w-full min-w-140 text-sm">
              <thead>
                <tr className="border-b border-sky-200 text-left text-xs text-sky-700">
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Operativos</th>
                  <th className="px-3 py-2">Examinados</th>
                  <th className="px-3 py-2">Ventas</th>
                  <th className="px-3 py-2">Conversión</th>
                  <th className="px-3 py-2">Vendido</th>
                  <th className="px-3 py-2">Utilidad neta</th>
                </tr>
              </thead>
              <tbody>
                {tiposOrdenados.map(([tipo, t]) => (
                  <tr key={tipo} className="border-b border-sky-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-sky-950">{TIPOS_VENUE[tipo] ?? tipo}</td>
                    <td className="px-3 py-2">{t.cantidad}</td>
                    <td className="px-3 py-2">{t.examenes}</td>
                    <td className="px-3 py-2">{t.ventas}</td>
                    <td className="px-3 py-2">{t.examenes > 0 ? `${Math.round((t.ventas / t.examenes) * 100)}%` : "—"}</td>
                    <td className="px-3 py-2">{clp(t.vendido)}</td>
                    <td className={`px-3 py-2 font-semibold ${t.utilidad >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {clp(t.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Todos los operativos</h2>
        {filasOrdenadas.length === 0 ? (
          <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">Todavía no hay operativos para comparar.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-sky-50 shadow-sm">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b border-sky-200 text-left text-xs text-sky-700">
                  <th className="px-3 py-2">Operativo</th>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Examinados</th>
                  <th className="px-3 py-2">Ventas</th>
                  <th className="px-3 py-2">Conversión</th>
                  <th className="px-3 py-2">Vendido</th>
                  <th className="px-3 py-2">Costos</th>
                  <th className="px-3 py-2">Utilidad neta</th>
                </tr>
              </thead>
              <tbody>
                {filasOrdenadas.map((f) => (
                  <tr key={f.id} className="border-b border-sky-100 last:border-0">
                    <td className="px-3 py-2">
                      <Link href={`/operativos/${f.id}`} className="font-medium text-sky-950 hover:underline">
                        {f.nombre}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-sky-800">{fechaLegible(f.fecha)}</td>
                    <td className="px-3 py-2 text-sky-800">{f.tipo_venue ? TIPOS_VENUE[f.tipo_venue] ?? f.tipo_venue : "—"}</td>
                    <td className="px-3 py-2">{f.examenes}</td>
                    <td className="px-3 py-2">{f.ventasCantidad}</td>
                    <td className="px-3 py-2">{f.examenes > 0 ? `${Math.round(f.conversion)}%` : "—"}</td>
                    <td className="px-3 py-2">{clp(f.vendido)}</td>
                    <td className="px-3 py-2">{clp(f.costos)}</td>
                    <td className={`px-3 py-2 font-semibold ${f.utilidad >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {clp(f.utilidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
