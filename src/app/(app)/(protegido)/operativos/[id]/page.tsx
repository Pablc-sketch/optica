import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarDetallesOperativo, actualizarOperativo, actualizarSueldosOperativo } from "@/lib/actions/operativos";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import { clp } from "@/lib/clp";
import { CampoMonto, CampoTelefono } from "@/components/campos";
import { desglosarCostos, type ItemConCosto } from "@/lib/costo-venta";
import { calcularSueldos, type BaseComision } from "@/lib/sueldos";

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
  // Math.max en 0 porque "actual" puede ser negativo (utilidad en rojo) —
  // sin esto la barra quedaba con ancho negativo.
  const pct = Math.max(0, Math.min(100, Math.round((actual / meta) * 100)));
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

const TIPOS_VENUE = [
  { valor: "condominio", etiqueta: "Condominio" },
  { valor: "junta_vecinos", etiqueta: "Junta de vecinos" },
  { valor: "apr", etiqueta: "APR" },
  { valor: "colegio", etiqueta: "Colegio" },
  { valor: "sala_cuna", etiqueta: "Sala cuna" },
  { valor: "supermercado", etiqueta: "Supermercado" },
  { valor: "otro", etiqueta: "Otro" },
];

export default async function DetalleOperativo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [operativoRes, recetasRes, ventasRes, retirosRes] = await Promise.all([
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
         venta_items (
           cantidad, precio_unitario, descuento, descripcion, cristal_slot,
           ordenes_trabajo:ot_id (fecha_entrega_estimada, tipo_lente, tratamiento, costo_laboratorio, costo_laboratorio_2),
           productos:producto_id (costo, categoria)
         ),
         pagos_abonos (monto)`
      )
      .eq("operativo_id", id)
      .eq("anulada", false)
      .order("fecha", { ascending: false }),
    supabase.from("retiros_sueldo").select("persona, monto").eq("operativo_id", id),
  ]);

  const operativo = operativoRes.data;
  if (!operativo) notFound();

  const recetas = recetasRes.data ?? [];
  const ventas = ventasRes.data ?? [];
  // Lo que ya se le adelantó a cada persona contra este operativo, para
  // mostrar cuánto falta transferir de verdad y no el bruto — sin esto la
  // tarjeta de sueldos no reflejaba los retiros ya hechos.
  const retirosPorPersona = new Map<string, number>();
  for (const r of retirosRes.data ?? []) {
    retirosPorPersona.set(r.persona, (retirosPorPersona.get(r.persona) ?? 0) + r.monto);
  }
  const pacientesConVenta = new Set(ventas.map((v) => v.paciente_id).filter(Boolean));

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  // Conversión: de la gente que se atendió, cuánta compró. Se cuenta por
  // PERSONA y no por receta — alguien puede salir con dos recetas del mismo
  // operativo y eso no lo convierte en dos pacientes, solo hundiría el
  // porcentaje sin razón. Las cortesías se separan porque atendieron a esa
  // persona pero no entró plata: cuentan como atención, no como venta.
  const pacientesExaminados = new Set(recetas.map((r) => r.paciente_id).filter(Boolean));
  const ventasPagadas = ventas.filter((v) => v.total > 0);
  const pacientesQuePagaron = new Set(ventasPagadas.map((v) => v.paciente_id).filter(Boolean));
  const totalExaminados = pacientesExaminados.size;
  const cortesias = ventas.length - ventasPagadas.length;
  const sinComprar = Math.max(0, totalExaminados - pacientesConVenta.size);
  const conversion = totalExaminados > 0 ? Math.round((pacientesQuePagaron.size / totalExaminados) * 100) : 0;
  // Ticket de los que SÍ pagaron — el promedio sobre todas las ventas
  // (incluidas las cortesías en $0) subestima lo que deja alguien que
  // compra, que es justo lo que se quiere proyectar acá.
  const ticketPromedio = ventasPagadas.length > 0 ? Math.round(totalVendido / ventasPagadas.length) : 0;
  // Lo que habría entrado si la mitad de los que se atendieron y no
  // compraron hubieran comprado. La mitad y no todos: es una meta que se
  // puede perseguir, no un número de fantasía.
  const oportunidad = Math.round((sinComprar / 2) * ticketPromedio);
  // Lo que la gente ya ha pagado de verdad (abonos + pagos completos), para
  // saber cuánta plata hay en la mano en medio del operativo, sin tener que
  // sumar venta por venta cuánto abonó cada uno.
  const totalAbonado = ventas.reduce(
    (s, v) => s + (v.pagos_abonos ?? []).reduce((si, p) => si + p.monto, 0),
    0
  );
  const totalDescuentos = ventas.reduce(
    (s, v) => s + (v.venta_items ?? []).reduce((si, it) => si + (it.descuento ?? 0), 0),
    0
  );
  // Cuántos pares de lentes y cuántos marcos se vendieron en total — no es
  // lo mismo que "Compraron" (cuánta gente compró), porque hay gente que se
  // lleva 2 pares (lejos y cerca por separado) en la misma venta.
  const totalCristalesVendidos = ventas.reduce(
    (s, v) => s + (v.venta_items ?? []).reduce((si, it) => si + (it.cristal_slot !== null ? it.cantidad : 0), 0),
    0
  );
  const totalMarcosVendidos = ventas.reduce(
    (s, v) =>
      s +
      (v.venta_items ?? []).reduce((si, it) => {
        const producto = uno(it.productos as unknown as { categoria: string } | { categoria: string }[] | null);
        return si + (producto?.categoria === "armazon" ? it.cantidad : 0);
      }, 0),
    0
  );
  // Costo real de lo vendido (cristales de laboratorio + marcos + otros
  // productos) — sin esto "utilidad" quedaba igual a "vendido", porque solo
  // se restaban los gastos del operativo (transporte, arriendo, etc), no lo
  // que costó producir lo que se vendió. El desglose (no solo el total) es
  // para que la tarjeta de costos se pueda abrir y mostrar de qué se compone.
  const todosLosItems = ventas.flatMap((v) => v.venta_items ?? []) as unknown as ItemConCosto[];
  const desglose = desglosarCostos(todosLosItems);
  const totalCostoProductos = desglose.total;

  const totalCostosOperativo =
    operativo.costo_transporte + operativo.costo_arriendo + operativo.costo_viaticos + operativo.costo_otros;
  const totalCostos = totalCostosOperativo + totalCostoProductos;
  const utilidadNeta = totalVendido - totalCostos;
  // Lo que ya se le adelantó a alguien contra ESTE operativo (retiros de
  // sueldo) es plata que de verdad salió de la cuenta/efectivo — sin
  // restarla acá, "Utilidad actual" quedaba mostrando plata que ya no está.
  const totalRetiros = [...retirosPorPersona.values()].reduce((s, m) => s + m, 0);
  // "Utilidad neta" cuenta lo VENDIDO, aunque todavía no se haya cobrado
  // entero (hay ventas con saldo pendiente). Esta es la plata de verdad
  // disponible ahora mismo: lo que ya se abonó, menos lo que hay que pagar
  // (cristales al laboratorio, marcos, gastos del operativo) y menos lo que
  // ya se retiró — si da negativo, significa que ya se debe/gastó más de
  // lo que se ha cobrado.
  //
  // Ojo: "cristales al laboratorio" acá es lo que se le VA A PAGAR a Fides
  // cuando se retire el pedido, no necesariamente lo que ya se pagó — por
  // eso este número es una proyección ("si liquidara todo hoy, ¿cuánto me
  // queda"), no un conteo de caja. Para saber lo que hay físicamente en la
  // cuenta y en efectivo ahora mismo, ver Reportes → Plata disponible.
  const utilidadActual = totalAbonado - totalCostos - totalRetiros;

  // Cómo se reparte este operativo entre Isadora (comisión), ahorro del
  // negocio y el resto dividido entre la mamá y Pablo. Usa "utilidadNeta"
  // (lo vendido, no solo lo cobrado) porque es la misma base que la meta
  // de utilidad y la que va a reportes — no la caja del momento.
  const sueldos = calcularSueldos(totalVendido, utilidadNeta, {
    comisionVendedoraPct: Number(operativo.comision_vendedora_pct),
    comisionVendedoraBase: operativo.comision_vendedora_base as BaseComision,
    ahorroPct: Number(operativo.ahorro_pct),
  });
  // Lo que falta transferir de verdad: el reparto de arriba menos lo que
  // cada persona ya sacó por adelantado contra este mismo operativo. Nunca
  // negativo — si alguien retiró de más, eso no se le "cobra" acá.
  const pendienteTransferir = {
    isadora: Math.max(0, sueldos.comisionIsadora - (retirosPorPersona.get("isadora") ?? 0)),
    madre: Math.max(0, sueldos.parteMadre - (retirosPorPersona.get("madre") ?? 0)),
    pablo: Math.max(0, sueldos.partePablo - (retirosPorPersona.get("pablo") ?? 0)),
  };

  // Próximas entregas: de las ventas de este operativo, las que tienen una
  // OT con fecha estimada, para que el resumen de cierre avise qué falta
  // entregar sin tener que ir a buscarlo a /ot.
  const vistas = new Set<string>();
  const entregas = ventas
    .flatMap((v) => {
      const paciente = uno(v.pacientes as unknown as PacienteRel);
      return (v.venta_items ?? [])
        .map((it) => uno(it.ordenes_trabajo as unknown as OtRel))
        .filter((ot): ot is NonNullable<typeof ot> => Boolean(ot?.fecha_entrega_estimada))
        .map((ot) => ({ paciente: paciente?.nombre ?? "Sin paciente", fecha: ot.fecha_entrega_estimada as string }));
    })
    // Lejos y cerca por separado comparten una sola OT (misma fecha
    // estimada): sin esto salía la misma entrega repetida dos veces.
    .filter((e) => {
      const clave = `${e.paciente}|${e.fecha}`;
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const textoResumen = [
    `📋 Resumen operativo: ${operativo.nombre}`,
    `📅 ${fechaLegible(operativo.fecha)}${operativo.direccion ? ` · ${operativo.direccion}` : ""}`,
    "",
    `👥 Examinados: ${recetas.length}`,
    `🛒 Compraron: ${ventas.length}`,
    `👓 Lentes vendidos: ${totalCristalesVendidos} · Marcos: ${totalMarcosVendidos}`,
    `💰 Vendido: ${clp(totalVendido)}`,
    ...(operativo.meta_examenes ? [`🎯 Meta exámenes: ${recetas.length}/${operativo.meta_examenes}`] : []),
    ...(operativo.meta_ventas ? [`🎯 Meta ventas: ${clp(totalVendido)}/${clp(operativo.meta_ventas)}`] : []),
    ...(operativo.meta_utilidad ? [`🎯 Meta utilidad: ${clp(utilidadNeta)}/${clp(operativo.meta_utilidad)}`] : []),
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
              operativo.fecha_fin && operativo.fecha_fin !== operativo.fecha
                ? `Del ${fechaLegible(operativo.fecha)} al ${fechaLegible(operativo.fecha_fin)}`
                : fechaLegible(operativo.fecha),
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
          {cortesias > 0 && (
            <p className="text-xs text-sky-700">
              {ventasPagadas.length} pagando · {cortesias} de cortesía
            </p>
          )}
        </div>
        {/* La conversión es la palanca más grande del operativo: se cuenta
            por persona (no por receta) y solo cuentan las ventas pagadas —
            una cortesía es atención, no venta. */}
        <details className="group rounded-2xl bg-sky-50 p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden sm:col-span-2">
          <summary className="cursor-pointer list-none">
            <p className="text-sm text-sky-800">
              📊 Conversión <span className="text-sky-400 group-open:hidden">▸</span>
              <span className="hidden text-sky-400 group-open:inline">▾</span>
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${conversion >= 50 ? "text-green-700" : conversion >= 35 ? "text-sky-900" : "text-amber-700"}`}
            >
              {conversion}%
            </p>
            <p className="text-xs text-sky-700">
              {pacientesQuePagaron.size} de {totalExaminados} personas atendidas compraron
            </p>
          </summary>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-sky-100 pt-3 text-sm text-sky-800">
            <div className="flex items-center justify-between">
              <span>Personas atendidas</span>
              <span className="font-medium">{totalExaminados}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Compraron pagando</span>
              <span className="font-medium">{pacientesQuePagaron.size}</span>
            </div>
            {cortesias > 0 && (
              <div className="flex items-center justify-between">
                <span>Se llevaron cortesía</span>
                <span className="font-medium">{cortesias}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span>Se atendieron y no compraron</span>
              <span className="font-medium text-amber-800">{sinComprar}</span>
            </div>
            <div className="flex items-center justify-between border-t border-sky-100 pt-1.5">
              <span>Ticket promedio (de los que pagaron)</span>
              <span className="font-medium">{clp(ticketPromedio)}</span>
            </div>
            {oportunidad > 0 && (
              <div className="mt-1 rounded-lg bg-white px-2 py-1.5">
                <p className="font-bold text-sky-900">
                  Si la mitad de esas {sinComprar} personas hubiera comprado: +{clp(oportunidad)}
                </p>
                <p className="mt-0.5 text-xs text-sky-700">
                  Subir la conversión rinde más que subir los precios: esa gente ya se atendió, ya está
                  el arriendo pagado y ya sabes qué lente necesita.
                </p>
              </div>
            )}
          </div>
        </details>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Lentes vendidos</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{totalCristalesVendidos}</p>
          <p className="text-xs text-sky-700">pares de cristales — hay quienes se llevan 2</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Marcos vendidos</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{totalMarcosVendidos}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Vendido</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalVendido)}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Abonado hasta ahora</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalAbonado)}</p>
          {totalVendido > totalAbonado && (
            <p className="text-xs text-sky-700">Falta {clp(totalVendido - totalAbonado)} por cobrar</p>
          )}
        </div>
        <div className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <p className="text-sm text-sky-800">Descuentos</p>
          <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalDescuentos)}</p>
        </div>
        <details className="group rounded-2xl bg-sky-50 p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none">
            <p className="text-sm text-sky-800">
              Costos en total <span className="text-sky-400 group-open:hidden">▸</span>
              <span className="hidden text-sky-400 group-open:inline">▾</span>
            </p>
            <p className="mt-1 text-2xl font-bold text-sky-900">{clp(totalCostos)}</p>
          </summary>
          <div className="mt-3 flex flex-col gap-3 border-t border-sky-100 pt-3 text-sm">
            <div className="flex flex-col gap-1.5">
              <p className="font-semibold text-sky-900">
                1. Cristales — lo que hay que pagarle a Fides por esta venta
              </p>
              {desglose.cristales.map((c, i) => (
                <div key={i} className="flex items-center justify-between pl-2 text-sky-800">
                  <span className="truncate">{c.descripcion}</span>
                  <span className="font-medium">{clp(c.costo)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between font-semibold text-sky-900">
                <span>Subtotal cristales</span>
                <span>{clp(desglose.totalCristales)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="font-semibold text-sky-900">2. Marcos — ya pagados antes, solo contable</p>
              <div className="flex items-center justify-between pl-2 text-sky-800">
                <span>{totalMarcosVendidos} marco{totalMarcosVendidos === 1 ? "" : "s"} × {clp(4000)}</span>
                <span className="font-medium">{clp(desglose.totalArmazones)}</span>
              </div>
              <p className="pl-2 text-xs text-sky-700">
                No es plata nueva que se vaya a gastar ahora — es para amortizar lo que ya se pagó al comprar
                el stock de marcos.
              </p>
              {desglose.totalOtros > 0 && (
                <div className="flex items-center justify-between pl-2 text-sky-800">
                  <span>+ Otros productos</span>
                  <span className="font-medium">{clp(desglose.totalOtros)}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="font-semibold text-sky-900">3. Costos del operativo — gastos reales del evento</p>
              <div className="flex items-center justify-between pl-2 text-sky-800">
                <span>Transporte</span>
                <span className="font-medium">{clp(operativo.costo_transporte)}</span>
              </div>
              <div className="flex items-center justify-between pl-2 text-sky-800">
                <span>Arriendo</span>
                <span className="font-medium">{clp(operativo.costo_arriendo)}</span>
              </div>
              <div className="flex items-center justify-between pl-2 text-sky-800">
                <span>Viáticos</span>
                <span className="font-medium">{clp(operativo.costo_viaticos)}</span>
              </div>
              <div className="flex items-center justify-between pl-2 text-sky-800">
                <span>Otros</span>
                <span className="font-medium">{clp(operativo.costo_otros)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-base font-bold text-sky-900">
              <span>= Costos en total</span>
              <span>{clp(totalCostos)}</span>
            </div>
          </div>
        </details>
        <details className="group rounded-2xl bg-sky-50 p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none">
            <p className="text-sm text-sky-800">
              Utilidad neta <span className="text-sky-400 group-open:hidden">▸</span>
              <span className="hidden text-sky-400 group-open:inline">▾</span>
            </p>
            <p className={`mt-1 text-2xl font-bold ${utilidadNeta >= 0 ? "text-green-700" : "text-red-700"}`}>
              {clp(utilidadNeta)}
            </p>
          </summary>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-sky-100 pt-3 text-sm text-sky-800">
            <div className="flex items-center justify-between">
              <span>Vendido</span>
              <span className="font-medium">{clp(totalVendido)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>− Costos en total</span>
              <span className="font-medium">{clp(totalCostos)}</span>
            </div>
            <div
              className={`mt-1 flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-base font-bold ${utilidadNeta >= 0 ? "text-green-700" : "text-red-700"}`}
            >
              <span>= Utilidad neta</span>
              <span>{clp(utilidadNeta)}</span>
            </div>
          </div>
        </details>
        <details className="group rounded-2xl bg-sky-50 p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none">
            <p className="text-sm text-sky-800">
              Utilidad actual (caja) <span className="text-sky-400 group-open:hidden">▸</span>
              <span className="hidden text-sky-400 group-open:inline">▾</span>
            </p>
            <p className={`mt-1 text-2xl font-bold ${utilidadActual >= 0 ? "text-green-700" : "text-red-700"}`}>
              {clp(utilidadActual)}
            </p>
            <p className="text-xs text-sky-700">
              {utilidadActual >= 0
                ? "Lo que te queda libre después de pagar cristales, marcos y gastos del operativo"
                : "Ya debes más de lo que has cobrado — cuidado antes de gastar"}
            </p>
          </summary>
          <div className="mt-3 flex flex-col gap-1.5 border-t border-sky-100 pt-3 text-sm text-sky-800">
            <div className="flex items-center justify-between">
              <span>Abonado hasta ahora</span>
              <span className="font-medium">{clp(totalAbonado)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>− Costos en total (cristales al laboratorio, marcos, gastos del operativo)</span>
              <span className="font-medium">{clp(totalCostos)}</span>
            </div>
            {totalRetiros > 0 && (
              <div className="flex items-center justify-between">
                <span>− Ya retirado (Isadora, mamá, Pablo)</span>
                <span className="font-medium">{clp(totalRetiros)}</span>
              </div>
            )}
            <div
              className={`mt-1 flex items-center justify-between rounded-lg bg-white px-2 py-1.5 text-base font-bold ${utilidadActual >= 0 ? "text-green-700" : "text-red-700"}`}
            >
              <span>= Utilidad actual</span>
              <span>{clp(utilidadActual)}</span>
            </div>
            <p className="mt-1 text-xs text-sky-700">
              A diferencia de &quot;Utilidad neta&quot;, esta cuenta solo la plata que ya está en la mano
              (no lo vendido a crédito/abono todavía pendiente) y ya descuenta lo que se haya retirado por
              adelantado — pero &quot;cristales al laboratorio&quot; sigue siendo lo que se le VA A PAGAR a
              Fides, no necesariamente lo ya pagado. Para la plata física real en la cuenta y en efectivo
              (con la comisión de tarjeta y los gastos globales incluidos), ver Reportes → Plata disponible.
            </p>
          </div>
        </details>
        <details className="group rounded-2xl bg-sky-50 p-4 shadow-sm [&_summary::-webkit-details-marker]:hidden sm:col-span-2" open>
          <summary className="cursor-pointer list-none">
            <p className="text-sm text-sky-800">
              💵 Sueldos de este operativo <span className="text-sky-400 group-open:hidden">▸</span>
              <span className="hidden text-sky-400 group-open:inline">▾</span>
            </p>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <span>
                Isadora ({Number(operativo.comision_vendedora_pct)}%) por transferir:{" "}
                <span className="font-bold text-sky-900">{clp(pendienteTransferir.isadora)}</span>
              </span>
              <span>
                Mamá por transferir: <span className="font-bold text-sky-900">{clp(pendienteTransferir.madre)}</span>
              </span>
              <span>
                Pablo por transferir: <span className="font-bold text-sky-900">{clp(pendienteTransferir.pablo)}</span>
              </span>
            </p>
          </summary>
          <div className="mt-3 flex flex-col gap-3 border-t border-sky-100 pt-3">
            {/* El % se edita acá arriba, antes del desglose, para que no
                haya que buscarlo — es lo primero que se ve al abrir la
                tarjeta. */}
            <form action={actualizarSueldosOperativo} className="grid grid-cols-1 gap-3 rounded-xl bg-white p-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={operativo.id} />
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                % comisión Isadora
                <input
                  name="comision_vendedora_pct"
                  inputMode="decimal"
                  defaultValue={Number(operativo.comision_vendedora_pct)}
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                Comisión sobre
                <select
                  name="comision_vendedora_base"
                  defaultValue={operativo.comision_vendedora_base}
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600"
                >
                  <option value="venta_total">Lo vendido</option>
                  <option value="utilidad_neta">La utilidad neta</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-sky-900">
                % ahorro
                <input
                  name="ahorro_pct"
                  inputMode="decimal"
                  defaultValue={Number(operativo.ahorro_pct)}
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-600"
                />
              </label>
              <div className="sm:col-span-3">
                <button className="rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800">
                  Guardar
                </button>
              </div>
            </form>

            <div className="flex flex-col gap-1.5 text-sm text-sky-800">
              <div className="flex items-center justify-between">
                <span>
                  Comisión Isadora ({Number(operativo.comision_vendedora_pct)}% de{" "}
                  {operativo.comision_vendedora_base === "utilidad_neta" ? "la utilidad neta" : "lo vendido"})
                </span>
                <span className="font-medium">{clp(sueldos.comisionIsadora)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>= Utilidad disponible</span>
                <span className={`font-medium ${sueldos.utilidadDisponible < 0 ? "text-red-700" : ""}`}>
                  {clp(sueldos.utilidadDisponible)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>− Ahorro ({Number(operativo.ahorro_pct)}%)</span>
                <span className="font-medium">{clp(sueldos.ahorro)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white px-2 py-1.5 font-semibold">
                <span>= Para dividir entre la mamá y Pablo</span>
                <span>{clp(sueldos.restoParaDividir)}</span>
              </div>
              <div className="flex items-center justify-between pl-2">
                <span>Mamá (50%)</span>
                <span className="font-medium">{clp(sueldos.parteMadre)}</span>
              </div>
              <div className="flex items-center justify-between pl-2">
                <span>Pablo (50%)</span>
                <span className="font-medium">{clp(sueldos.partePablo)}</span>
              </div>
              {/* Lo ya retirado contra este operativo (Reportes → Retiros)
                  se descuenta acá para que el número final sea justo lo
                  que hay que transferir, no el bruto del reparto. */}
              {(retirosPorPersona.get("isadora") ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-2 text-xs text-sky-700">
                  <span>− Isadora ya retiró</span>
                  <span>{clp(retirosPorPersona.get("isadora") ?? 0)}</span>
                </div>
              )}
              {(retirosPorPersona.get("madre") ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-2 text-xs text-sky-700">
                  <span>− Mamá ya retiró</span>
                  <span>{clp(retirosPorPersona.get("madre") ?? 0)}</span>
                </div>
              )}
              {(retirosPorPersona.get("pablo") ?? 0) > 0 && (
                <div className="flex items-center justify-between pl-2 text-xs text-sky-700">
                  <span>− Pablo ya retiró</span>
                  <span>{clp(retirosPorPersona.get("pablo") ?? 0)}</span>
                </div>
              )}
              <div className="mt-1 flex flex-col gap-1 rounded-lg bg-sky-100 px-2 py-1.5 font-bold text-sky-900">
                <div className="flex items-center justify-between">
                  <span>Isadora — por transferir</span>
                  <span>{clp(pendienteTransferir.isadora)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Mamá — por transferir</span>
                  <span>{clp(pendienteTransferir.madre)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pablo — por transferir</span>
                  <span>{clp(pendienteTransferir.pablo)}</span>
                </div>
              </div>
              {sueldos.utilidadDisponible < 0 && (
                <p className="mt-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs font-medium text-red-800">
                  Este operativo no alcanza a cubrir la comisión de Isadora con lo que dejó de utilidad —
                  no hay ahorro ni reparto para la mamá o Pablo en este operativo.
                </p>
              )}
              <p className="mt-1 text-xs text-sky-700">
                Este cálculo es solo de este operativo. El total mensual de cada quién (que va sumando con
                cada operativo y se reinicia el mes siguiente) está en Reportes → Sueldos del mes.
              </p>
            </div>
          </div>
        </details>
      </div>

      {(operativo.meta_examenes || operativo.meta_ventas || operativo.meta_utilidad) && (
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
          {operativo.meta_utilidad && (
            <BarraProgreso titulo="Meta de utilidad" actual={utilidadNeta} meta={operativo.meta_utilidad} formatear={clp} />
          )}
        </div>
      )}

      <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-sky-800">✎ Editar datos del operativo</summary>
        <form action={actualizarOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={operativo.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900 sm:col-span-2">
            Nombre *
            <input
              name="nombre"
              required
              defaultValue={operativo.nombre}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Tipo de lugar
            <select
              name="tipo_venue"
              defaultValue={operativo.tipo_venue ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            >
              <option value="">— Sin especificar —</option>
              {TIPOS_VENUE.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Dirección
            <input
              name="direccion"
              defaultValue={operativo.direccion ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Fecha de inicio *
            <input
              type="date"
              name="fecha"
              required
              defaultValue={operativo.fecha}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Fecha de término (si dura más de un día)
            <input
              type="date"
              name="fecha_fin"
              defaultValue={operativo.fecha_fin ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Fecha de entrega (cuando se vuelve a dejar los lentes)
            <input
              type="date"
              name="fecha_entrega_estimada"
              defaultValue={operativo.fecha_entrega_estimada ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
            <span className="text-xs font-normal text-sky-700">
              Todas las ventas de este operativo quedan con esta misma fecha de entrega, en vez de calcularla
              venta por venta.
            </span>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Contacto
            <input
              name="contacto_nombre"
              defaultValue={operativo.contacto_nombre ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Teléfono de contacto
            <CampoTelefono
              name="contacto_telefono"
              defaultValue={operativo.contacto_telefono ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900 sm:col-span-2">
            Notas
            <textarea
              name="notas"
              rows={2}
              defaultValue={operativo.notas ?? ""}
              className="rounded-lg border border-sky-200 bg-white px-3 py-2.5 text-base outline-none focus:border-sky-600"
            />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-800">
              Guardar
            </button>
          </div>
        </form>
      </details>

      <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-sky-800">💰 Costos y metas del operativo</summary>
        <form action={actualizarDetallesOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={operativo.id} />
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Transporte
            <CampoMonto name="costo_transporte" defaultValue={operativo.costo_transporte} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Arriendo (espacio o equipos)
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
          <label className="flex flex-col gap-1 text-sm font-medium text-sky-900">
            Meta de utilidad (opcional)
            <CampoMonto name="meta_utilidad" defaultValue={operativo.meta_utilidad} placeholder="200000" />
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
