import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarDetallesOperativo } from "@/lib/actions/operativos";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import { clp } from "@/lib/clp";
import { CampoMonto } from "@/components/campos";

// Detalle de un operativo: quién se examinó, quién compró, qué se le
// vendió y cuándo se le entrega — para que al ofrecer el próximo operativo
// se sepa de un vistazo cómo salió el anterior. Colores distintos (celeste
// en vez del terracota del resto de la app) para diferenciar que es una
// pantalla de "en terreno", no del día a día del local.

type PacienteRel = { id: string; nombre: string; rut: string | null; telefono: string | null } | { id: string; nombre: string; rut: string | null; telefono: string | null }[] | null;
type OtRel =
  | { fecha_entrega_estimada: string | null; tipo_lente: string | null; tratamiento: string | null }
  | { fecha_entrega_estimada: string | null; tipo_lente: string | null; tratamiento: string | null }[]
  | null;

function uno<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

function BarraProgreso({ titulo, actual, meta, formatear }: { titulo: string; actual: number; meta: number; formatear: (n: number) => string }) {
  const pct = Math.min(100, Math.round((actual / meta) * 100));
  const cumplida = actual >= meta;
  return (
    <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-sky-800">
        <span>{titulo}</span>
        <span className="font-semibold">
          {formatear(actual)} / {formatear(meta)}
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-sky-100">
        <div
          className={`h-full rounded-full transition-all ${cumplida ? "bg-green-500" : "bg-sky-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-sky-700">{cumplida ? "¡Meta cumplida! 🎉" : `${pct}% de la meta`}</p>
    </div>
  );
}

const ESTADOS: Record<string, string> = {
  planificado: "Planificado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

const ESTADO_PAGO: Record<string, { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-red-100 text-red-700" },
  abono_parcial: { label: "Abono parcial", clase: "bg-amber-100 text-amber-700" },
  pagada: { label: "Pagada", clase: "bg-green-100 text-green-700" },
};

export default async function DetalleOperativo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [operativoRes, recetasRes, ventasRes] = await Promise.all([
    supabase.from("operativos").select("*").eq("id", id).single(),
    supabase
      .from("recetas")
      .select("id, fecha, paciente_id, pacientes:paciente_id (id, nombre, rut, telefono)")
      .eq("operativo_id", id)
      .order("fecha", { ascending: false }),
    supabase
      .from("ventas")
      .select(
        `id, total, estado_pago, paciente_id,
         pacientes:paciente_id (id, nombre, rut, telefono),
         venta_items (cantidad, precio_unitario, descuento, descripcion, ordenes_trabajo:ot_id (fecha_entrega_estimada, tipo_lente, tratamiento))`
      )
      .eq("operativo_id", id)
      .eq("anulada", false)
      .order("fecha", { ascending: false }),
  ]);

  const operativo = operativoRes.data;
  if (!operativo) notFound();

  const recetas = recetasRes.data ?? [];
  const ventas = ventasRes.data ?? [];
  const pacientesConVenta = new Set(ventas.map((v) => v.paciente_id).filter(Boolean));

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const totalDescuentos = ventas.reduce(
    (s, v) => s + (v.venta_items ?? []).reduce((si, it) => si + (it.descuento ?? 0), 0),
    0
  );

  const totalCostos =
    operativo.costo_transporte + operativo.costo_arriendo + operativo.costo_viaticos + operativo.costo_otros;
  const utilidadNeta = totalVendido - totalCostos;

  // Próximas entregas: de las ventas de este operativo, las que tienen una
  // OT con fecha estimada, para que el resumen de cierre avise qué falta
  // entregar sin tener que ir a buscarlo a /ot.
  const entregas = ventas
    .flatMap((v) => {
      const paciente = uno(v.pacientes as unknown as PacienteRel);
      return (v.venta_items ?? [])
        .map((it) => uno(it.ordenes_trabajo as unknown as OtRel))
        .filter((ot): ot is NonNullable<typeof ot> => Boolean(ot?.fecha_entrega_estimada))
        .map((ot) => ({ paciente: paciente?.nombre ?? "Sin paciente", fecha: ot.fecha_entrega_estimada as string }));
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const textoResumen = [
    `📋 Resumen operativo: ${operativo.nombre}`,
    `📅 ${fechaLegible(operativo.fecha)}${operativo.direccion ? ` · ${operativo.direccion}` : ""}`,
    "",
    `👥 Examinados: ${recetas.length}`,
    `🛒 Compraron: ${ventas.length}`,
    `💰 Vendido: ${clp(totalVendido)}`,
    ...(operativo.meta_examenes ? [`🎯 Meta exámenes: ${recetas.length}/${operativo.meta_examenes}`] : []),
    ...(operativo.meta_ventas ? [`🎯 Meta ventas: ${clp(totalVendido)}/${clp(operativo.meta_ventas)}`] : []),
    ...(entregas.length > 0
      ? ["", "📦 Próximas entregas:", ...entregas.map((e) => `• ${e.paciente}: ${fechaLegible(e.fecha)}`)]
      : []),
  ].join("\n");
  const linkWsp = `https://wa.me/?text=${encodeURIComponent(textoResumen)}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/operativos" className="text-xs font-medium text-sky-700 hover:underline">
            ← Todos los operativos
          </Link>
          <h1 className="mt-1 text-xl font-bold">{operativo.nombre}</h1>
          <p className="text-sm text-tinta-suave">
            {[
              fechaLegible(operativo.fecha),
              operativo.direccion,
              [operativo.contacto_nombre, formatearTelefono(operativo.contacto_telefono)].filter(Boolean).join(" · ") || null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={linkWsp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700"
          >
            💬 Compartir resumen
          </a>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              operativo.estado === "planificado"
                ? "bg-sky-100 text-sky-800"
                : operativo.estado === "realizado"
                  ? "bg-green-100 text-green-800"
                  : "bg-neutral-200 text-neutral-600"
            }`}
          >
            {ESTADOS[operativo.estado] ?? operativo.estado}
          </span>
        </div>
      </div>

      {operativo.notas && (
        <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-900">{operativo.notas}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Examinados</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{recetas.length}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Compraron</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{ventas.length}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Vendido</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalVendido)}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Descuentos</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalDescuentos)}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Costos del operativo</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalCostos)}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Utilidad neta</p>
          <p className={`mt-1 text-2xl font-bold ${utilidadNeta >= 0 ? "text-green-700" : "text-red-700"}`}>
            {clp(utilidadNeta)}
          </p>
        </div>
      </div>

      {(operativo.meta_examenes || operativo.meta_ventas) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {operativo.meta_examenes && (
            <BarraProgreso
              titulo="Meta de exámenes"
              actual={recetas.length}
              meta={operativo.meta_examenes}
              formatear={(n) => String(n)}
            />
          )}
          {operativo.meta_ventas && (
            <BarraProgreso titulo="Meta de ventas" actual={totalVendido} meta={operativo.meta_ventas} formatear={clp} />
          )}
        </div>
      )}

      <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-sky-800">💰 Costos y metas del operativo</summary>
        <form action={actualizarDetallesOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={operativo.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Transporte
            <CampoMonto name="costo_transporte" defaultValue={operativo.costo_transporte} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Arriendo del espacio
            <CampoMonto name="costo_arriendo" defaultValue={operativo.costo_arriendo} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Viáticos
            <CampoMonto name="costo_viaticos" defaultValue={operativo.costo_viaticos} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Otros costos
            <CampoMonto name="costo_otros" defaultValue={operativo.costo_otros} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Meta de exámenes (opcional)
            <input
              name="meta_examenes"
              inputMode="numeric"
              defaultValue={operativo.meta_examenes ?? ""}
              placeholder="30"
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Meta de ventas (opcional)
            <CampoMonto name="meta_ventas" defaultValue={operativo.meta_ventas} placeholder="500000" />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-800">
              Guardar
            </button>
          </div>
        </form>
      </details>

      <section>
        <h2 className="mb-2 font-semibold">Ventas y entregas</h2>
        {ventas.length === 0 ? (
          <p className="rounded-2xl bg-sky-50/60 p-4 text-sm text-tinta-suave">
            Todavía nadie ha comprado en este operativo.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ventas.map((v) => {
              const paciente = uno(v.pacientes as unknown as PacienteRel);
              const estado = ESTADO_PAGO[v.estado_pago] ?? ESTADO_PAGO.pendiente;
              const descuentoVenta = (v.venta_items ?? []).reduce((s, it) => s + (it.descuento ?? 0), 0);
              return (
                <li key={v.id} className="rounded-xl border border-sky-100 bg-white p-3 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{paciente?.nombre ?? "Sin paciente"}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>
                      {estado.label}
                    </span>
                    <span className="font-bold">{clp(v.total)}</span>
                  </div>
                  {paciente && (
                    <p className="text-xs text-tinta-suave">
                      {[formatearRut(paciente.rut) || null, formatearTelefono(paciente.telefono) || null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  <ul className="mt-1.5 flex flex-col gap-0.5">
                    {(v.venta_items ?? []).map((it, i) => {
                      const ot = uno(it.ordenes_trabajo as unknown as OtRel);
                      return (
                        <li key={i} className="text-xs text-tinta-suave">
                          {it.descripcion}
                          {ot?.fecha_entrega_estimada && (
                            <> · entrega {fechaLegible(ot.fecha_entrega_estimada)}</>
                          )}
                          {it.descuento > 0 && (
                            <span className="ml-1 font-semibold text-sky-700">· descuento {clp(it.descuento)}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {descuentoVenta > 0 && (
                    <p className="mt-1 text-xs font-semibold text-sky-700">
                      Descuento total de esta venta: {clp(descuentoVenta)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Pacientes examinados</h2>
        {recetas.length === 0 ? (
          <p className="rounded-2xl bg-sky-50/60 p-4 text-sm text-tinta-suave">
            Todavía no hay recetas cargadas para este operativo.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-sky-50/60 p-3 shadow-sm">
            {recetas.map((r) => {
              const paciente = uno(r.pacientes as unknown as PacienteRel);
              const compro = paciente && pacientesConVenta.has(paciente.id);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  {paciente ? (
                    <Link href={`/pacientes/${paciente.id}`} className="min-w-32 flex-1 font-medium hover:underline">
                      {paciente.nombre}
                    </Link>
                  ) : (
                    <span className="min-w-32 flex-1 text-tinta-suave">Sin paciente</span>
                  )}
                  <span className="text-xs text-tinta-suave">{fechaLegible(r.fecha)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      compro ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {compro ? "Compró" : "Sin compra"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
