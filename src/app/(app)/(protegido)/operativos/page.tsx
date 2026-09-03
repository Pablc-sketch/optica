import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearOperativo, cambiarEstadoOperativo } from "@/lib/actions/operativos";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";
import { clp } from "@/lib/clp";
import { CampoTelefono } from "@/components/campos";
import { costoDeItems, type ItemConCosto } from "@/lib/costo-venta";

const TIPOS_VENUE = [
  { valor: "condominio", etiqueta: "Condominio" },
  { valor: "junta_vecinos", etiqueta: "Junta de vecinos" },
  { valor: "apr", etiqueta: "APR" },
  { valor: "colegio", etiqueta: "Colegio" },
  { valor: "sala_cuna", etiqueta: "Sala cuna" },
  { valor: "supermercado", etiqueta: "Supermercado" },
  { valor: "otro", etiqueta: "Otro" },
];

const ESTADOS: Record<string, string> = {
  planificado: "Planificado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-3xl bg-sky-50 p-4 shadow-[0_2px_10px_-3px_rgba(3,105,161,0.15)] transition hover:shadow-[0_8px_24px_-6px_rgba(3,105,161,0.22)]">
      <p className="text-sm text-sky-800">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-sky-950">{valor}</p>
      {detalle && <p className="text-xs text-sky-700">{detalle}</p>}
    </div>
  );
}

export default async function OperativosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  const esAdmin = perfilRes.data?.rol === "admin";

  if (!esAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Operativos</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica maneja los operativos. Al cargar una venta o una
          receta igual vas a poder elegir a cuál corresponde.
        </p>
      </div>
    );
  }

  const [{ data: operativos }, { data: recetas }, { data: ventas }] = await Promise.all([
    supabase
      .from("operativos")
      .select(
        "id, nombre, tipo_venue, fecha, direccion, contacto_nombre, contacto_telefono, estado, notas, costo_transporte, costo_arriendo, costo_viaticos, costo_otros"
      )
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

  // Un vistazo de cómo le fue a cada operativo sin tener que entrar: cuántos
  // exámenes, cuántas ventas y cuánto se vendió — se arma en memoria en vez
  // de una consulta por operativo.
  const examenesPorOperativo = new Map<string, number>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id) continue;
    examenesPorOperativo.set(r.operativo_id, (examenesPorOperativo.get(r.operativo_id) ?? 0) + 1);
  }
  const ventasPorOperativo = new Map<string, { cantidad: number; total: number }>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    const actual = ventasPorOperativo.get(v.operativo_id) ?? { cantidad: 0, total: 0 };
    actual.cantidad += 1;
    actual.total += v.total;
    ventasPorOperativo.set(v.operativo_id, actual);
  }

  const lista = operativos ?? [];
  const planificados = lista.filter((o) => o.estado === "planificado").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const otros = lista.filter((o) => o.estado !== "planificado");

  const hoy = hoyEnChile();
  const proximo = planificados.find((o) => o.fecha >= hoy) ?? planificados[0];
  const totalExaminados = [...examenesPorOperativo.values()].reduce((s, n) => s + n, 0);
  const totalVendido = [...ventasPorOperativo.values()].reduce((s, v) => s + v.total, 0);
  // Costo real de lo vendido (cristales de laboratorio + marcos + otros
  // productos), no solo los gastos propios del operativo — si no, "utilidad"
  // quedaba igual a "vendido".
  const totalCostoProductos = (ventas ?? []).reduce(
    (s, v) => s + costoDeItems((v.venta_items ?? []) as unknown as ItemConCosto[]),
    0
  );
  const totalCostosOperativos = lista.reduce(
    (s, o) => s + o.costo_transporte + o.costo_arriendo + o.costo_viaticos + o.costo_otros,
    0
  );
  const totalCostos = totalCostosOperativos + totalCostoProductos;
  const utilidadNeta = totalVendido - totalCostos;

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Operativos</h1>
        <Link
          href="/operativos/comparar"
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
        >
          📊 Comparar operativos
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tarjeta titulo="Operativos" valor={String(lista.length)} detalle={`${planificados.length} planificado${planificados.length === 1 ? "" : "s"}`} />
        <Tarjeta
          titulo="Próximo"
          valor={proximo ? proximo.nombre : "—"}
          detalle={proximo ? fechaLegible(proximo.fecha) : "Sin operativos planificados"}
        />
        <Tarjeta titulo="Examinados en total" valor={String(totalExaminados)} />
        <Tarjeta titulo="Vendido en total" valor={clp(totalVendido)} />
        <Tarjeta
          titulo="Costos en total"
          valor={clp(totalCostos)}
          detalle={`${clp(totalCostoProductos)} de lo vendido + ${clp(totalCostosOperativos)} de operativos`}
        />
        <Tarjeta titulo="Utilidad neta" valor={clp(utilidadNeta)} />
      </div>

      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {[...planificados, ...otros].map((o) => {
            const examenes = examenesPorOperativo.get(o.id) ?? 0;
            const venta = ventasPorOperativo.get(o.id);
            return (
              <li key={o.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/operativos/${o.id}`} className="flex-1">
                    <p className="font-medium text-sky-950">
                      {o.nombre}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                          o.estado === "planificado"
                            ? "bg-sky-200 text-sky-900"
                            : o.estado === "realizado"
                              ? "bg-green-100 text-green-800"
                              : "bg-neutral-200 text-neutral-600"
                        }`}
                      >
                        {ESTADOS[o.estado] ?? o.estado}
                      </span>
                    </p>
                    <p className="text-sm text-sky-800">
                      {[
                        fechaLegible(o.fecha),
                        TIPOS_VENUE.find((t) => t.valor === o.tipo_venue)?.etiqueta,
                        o.direccion,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {(o.contacto_nombre || o.contacto_telefono) && (
                      <p className="text-xs text-sky-700">
                        {[o.contacto_nombre, formatearTelefono(o.contacto_telefono)].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {o.notas && <p className="mt-1 text-xs text-sky-700">{o.notas}</p>}
                    {(examenes > 0 || venta) && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-800">
                        <span className="rounded-full bg-white px-2 py-0.5">👥 {examenes} examinado{examenes === 1 ? "" : "s"}</span>
                        {venta && (
                          <span className="rounded-full bg-white px-2 py-0.5">
                            💰 {clp(venta.total)} · {venta.cantidad} venta{venta.cantidad === 1 ? "" : "s"}
                          </span>
                        )}
                      </p>
                    )}
                  </Link>
                  {o.estado !== "cancelado" && (
                    <form action={cambiarEstadoOperativo} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={o.id} />
                      <input
                        type="hidden"
                        name="estado"
                        value={o.estado === "planificado" ? "realizado" : "cancelado"}
                      />
                      <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-xs font-medium transition hover:bg-white">
                        {o.estado === "planificado" ? "Marcar realizado" : "Cancelar"}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
          {lista.length === 0 && (
            <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
              Todavía no hay operativos creados. Crea el primero abajo.
            </p>
          )}
        </ul>

        <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-sky-800">＋ Nuevo operativo</summary>
          <form action={crearOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nombre *
              <input name="nombre" required placeholder="Colegio San José" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tipo de lugar
              <select name="tipo_venue" defaultValue="" className={input}>
                <option value="">— Sin especificar —</option>
                {TIPOS_VENUE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fecha *
              <input type="date" name="fecha" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirección
              <input name="direccion" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contacto
              <input name="contacto_nombre" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Teléfono de contacto
              <CampoTelefono name="contacto_telefono" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Notas
              <textarea name="notas" rows={2} className={input} />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-800">
                Crear operativo
              </button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
