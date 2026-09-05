import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import BotonImprimir from "@/components/boton-imprimir";
import Tarjeta from "@/components/tarjeta";
import { fechaLegible, finDelDia, hoyEnChile, inicioDelDia } from "@/lib/fechas";
import { desglosarCostos } from "@/lib/costo-venta";

// Reportes (spec pantalla 10). Acá recién sirven los costos que quedaron
// guardados sin mostrarse en la interfaz: el costo del armazón y el costo
// de laboratorio del cristal permiten estimar la utilidad real de cada
// período, no solo lo facturado.

const MEDIOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
};

function inicioDeMes(): string {
  const hoy = hoyEnChile();
  return `${hoy.slice(0, 7)}-01`;
}

type OTResumen = {
  costo_laboratorio: number;
  costo_laboratorio_2: number | null;
  tipo_lente: string | null;
  tratamiento: string | null;
  tipo_lente_2: string | null;
  tratamiento_2: string | null;
};

type ItemVenta = {
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  cristal_slot: number | null;
  productos: { costo: number; categoria: string } | { costo: number; categoria: string }[] | null;
  ordenes_trabajo: OTResumen | OTResumen[] | null;
};

// supabase-js tipa las relaciones como objeto o arreglo según el caso.
function uno<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}


export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; operativo_id?: string }>;
}) {
  const params = await searchParams;
  const desde = params.desde || inicioDeMes();
  const hasta = params.hasta || hoyEnChile();
  const operativoId = params.operativo_id || "";

  const supabase = await createClient();

  let ventasQuery = supabase
    .from("ventas")
    .select("id, total, vendedor_id, users:vendedor_id (nombre), pagos_abonos (monto)")
    .eq("anulada", false)
    .gte("fecha", inicioDelDia(desde))
    .lte("fecha", finDelDia(hasta));
  let itemsQuery = supabase
    .from("venta_items")
    .select(
      `cantidad, precio_unitario, descuento, cristal_slot,
       productos:producto_id (costo, categoria),
       ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
       ventas!inner (fecha, operativo_id, anulada)`
    )
    .eq("ventas.anulada", false)
    .gte("ventas.fecha", inicioDelDia(desde))
    .lte("ventas.fecha", finDelDia(hasta));
  // pagos_abonos no tiene operativo propio (se paga contra una venta, no
  // contra un operativo); el filtro solo se aplica a lo vendido. Se junta
  // con ventas para excluir pagos de ventas que después se anularon — si
  // no, "Cobrado" seguiría contando plata de una venta que ya no cuenta.
  const pagosQuery = supabase
    .from("pagos_abonos")
    .select(
      "monto, medio_pago, fecha, ventas!inner (anulada, pacientes:paciente_id (nombre))"
    )
    .eq("ventas.anulada", false)
    .gte("fecha", inicioDelDia(desde))
    .lte("fecha", finDelDia(hasta))
    .order("fecha", { ascending: false });

  if (operativoId) {
    ventasQuery = ventasQuery.eq("operativo_id", operativoId);
    itemsQuery = itemsQuery.eq("ventas.operativo_id", operativoId);
  }

  const [ventasRes, itemsRes, pagosRes, operativosRes] = await Promise.all([
    ventasQuery,
    itemsQuery,
    pagosQuery,
    supabase.from("operativos").select("id, nombre").order("fecha", { ascending: false }),
  ]);
  const operativos = operativosRes.data ?? [];

  const ventas = ventasRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as ItemVenta[];
  const pagos = pagosRes.data ?? [];

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const numVentas = ventas.length;
  const ticketPromedio = numVentas > 0 ? Math.round(totalVendido / numVentas) : 0;
  const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0);
  // Uno por uno los abonos que arman "Cobrado en el período", para poder
  // revisar de dónde sale la plata (¿está el efectivo que me pagaron?, etc.)
  // en vez de solo confiar en la suma.
  const pagosDetalle = pagos.map((p) => {
    const venta = uno(p.ventas as unknown as { pacientes: { nombre: string } | { nombre: string }[] | null } | { pacientes: { nombre: string } | { nombre: string }[] | null }[] | null);
    const paciente = uno(venta?.pacientes as unknown as { nombre: string } | { nombre: string }[] | null);
    return { fecha: p.fecha, monto: p.monto, medioPago: p.medio_pago, paciente: paciente?.nombre ?? null };
  });
  // Saldo real pendiente: el total de la venta MENOS lo que ya se le ha
  // abonado (en cualquier momento, no solo en este período) — antes se
  // sumaba el total completo de cada venta no "pagada", como si el abono ya
  // hecho no contara, así que una venta con harto abonado igual sumaba
  // entero y "Por cobrar" quedaba inflado.
  const porCobrar = ventas.reduce((s, v) => {
    const abonado = (v.pagos_abonos ?? []).reduce((si, p) => si + p.monto, 0);
    return s + Math.max(0, v.total - abonado);
  }, 0);

  // Costo directo: cristales a lo que cobra el laboratorio, marcos a un
  // monto fijo por unidad (se regalan, pero igual cuestan) y el resto de
  // los productos a su costo de Inventario — mismo criterio que Operativos,
  // para que la utilidad no cambie de un reporte a otro. No incluye
  // arriendo, sueldos ni gastos fijos. El desglose (no solo el total) es
  // para poder revisar lente por lente cuánto cuesta de verdad, en vez de
  // solo confiar en la suma.
  const desglose = desglosarCostos(items);
  const costoDirecto = desglose.total;
  const utilidadBruta = totalVendido - costoDirecto;
  const margen = totalVendido > 0 ? Math.round((utilidadBruta / totalVendido) * 100) : 0;

  // Ranking de cristales por tratamiento vendido.
  const porTratamiento = new Map<string, { unidades: number; vendido: number }>();
  for (const item of items) {
    const ot = uno(item.ordenes_trabajo);
    if (!ot) continue;
    // Lejos y cerca por separado comparten una sola OT: cada ítem apunta a
    // su propio cupo (1 o 2), cada uno con su tipo/tratamiento.
    const tipoLente = item.cristal_slot === 2 ? ot.tipo_lente_2 : ot.tipo_lente;
    const tratamiento = item.cristal_slot === 2 ? ot.tratamiento_2 : ot.tratamiento;
    if (!tratamiento) continue;
    const clave = `${tipoLente ?? ""} · ${tratamiento}`.trim();
    const actual = porTratamiento.get(clave) ?? { unidades: 0, vendido: 0 };
    actual.unidades += item.cantidad;
    actual.vendido += item.cantidad * item.precio_unitario - item.descuento;
    porTratamiento.set(clave, actual);
  }
  const rankingCristales = [...porTratamiento.entries()]
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .slice(0, 8);

  // Rendimiento por vendedor.
  const porVendedor = new Map<string, { ventas: number; total: number }>();
  for (const v of ventas) {
    const nombre = uno(v.users as unknown as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "Sin vendedor";
    const actual = porVendedor.get(nombre) ?? { ventas: 0, total: 0 };
    actual.ventas += 1;
    actual.total += v.total;
    porVendedor.set(nombre, actual);
  }
  const rankingVendedores = [...porVendedor.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold">Reportes</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap items-center gap-2" action="/reportes">
            <label className="flex items-center gap-1 text-sm">
              Desde
              <input type="date" name="desde" defaultValue={desde} className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              Hasta
              <input type="date" name="hasta" defaultValue={hasta} className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
            </label>
            {operativos.length > 0 && (
              <label className="flex items-center gap-1 text-sm">
                Operativo
                <select
                  name="operativo_id"
                  defaultValue={operativoId}
                  className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                >
                  <option value="">Todos</option>
                  {operativos.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Ver
            </button>
          </form>
          <BotonImprimir />
        </div>
      </div>

      <p className="text-sm text-tinta-suave">
        Período: {fechaLegible(desde)} al {fechaLegible(hasta)}
        {operativoId && (
          <> · {operativos.find((o) => o.id === operativoId)?.nombre ?? "operativo filtrado"}</>
        )}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta icono="💰" titulo="Vendido" valor={clp(totalVendido)} detalle={`${numVentas} venta${numVentas === 1 ? "" : "s"}`} />
        <Tarjeta icono="🎟" titulo="Ticket promedio" valor={clp(ticketPromedio)} />
        <details className="group relative overflow-hidden rounded-3xl bg-white p-4 shadow-[0_2px_10px_-3px_rgba(61,57,41,0.15)] transition hover:shadow-[0_8px_24px_-6px_rgba(61,57,41,0.22)] [&_summary::-webkit-details-marker]:hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-brand to-accent" />
          <summary className="cursor-pointer list-none">
            <p className="flex items-center gap-1.5 text-sm text-tinta-suave">
              <span className="text-base">✅</span> Cobrado en el período{" "}
              <span className="text-tinta-suave/50 group-open:hidden">▸</span>
              <span className="hidden text-tinta-suave/50 group-open:inline">▾</span>
            </p>
            <p className="mt-1 text-2xl font-bold text-tinta">{clp(totalAbonado)}</p>
          </summary>
          <div className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto border-t border-tinta-suave/15 pt-3 text-sm">
            {pagosDetalle.length === 0 ? (
              <p className="text-tinta-suave">Sin abonos registrados en este período.</p>
            ) : (
              pagosDetalle.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-tinta-suave">{fechaLegible(p.fecha.slice(0, 10))}</span>
                  <span className="flex-1 truncate">{p.paciente ?? "Sin paciente"}</span>
                  <span className="rounded-full bg-crema-claro px-2 py-0.5 text-xs font-medium text-tinta-suave">
                    {MEDIOS_PAGO[p.medioPago] ?? p.medioPago}
                  </span>
                  <span className="font-semibold">{clp(p.monto)}</span>
                </div>
              ))
            )}
            <div className="mt-1 flex items-center justify-between rounded-lg bg-brand/10 px-2 py-1.5 font-bold text-brand-dark">
              <span>= Cobrado en el período</span>
              <span>{clp(totalAbonado)}</span>
            </div>
          </div>
        </details>
        <Tarjeta icono="⏳" titulo="Por cobrar" valor={clp(porCobrar)} acento={porCobrar > 0} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Utilidad estimada</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tarjeta icono="📦" titulo="Costo directo" valor={clp(costoDirecto)} detalle="armazones + laboratorio" />
          <Tarjeta icono="📈" titulo="Utilidad bruta" valor={clp(utilidadBruta)} acento />
          <Tarjeta icono="🎯" titulo="Margen" valor={`${margen}%`} detalle="sobre lo vendido" />
        </div>
        <p className="mt-2 text-xs text-tinta-suave">
          No incluye arriendo, sueldos ni otros gastos fijos: es el margen que deja la mercadería
          vendida en el período.
        </p>

        <details className="mt-3 rounded-2xl bg-crema-claro p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-brand-dark">
            👓 Ver el detalle: cuánto nos sale cada lente
          </summary>
          <div className="mt-3 flex flex-col gap-1.5">
            <p className="rounded-lg bg-white px-3 py-2 text-sm font-semibold">
              Cristales (precio unitario × 2 + montaje + IVA)
            </p>
            {desglose.cristales.length === 0 ? (
              <p className="px-3 text-sm text-tinta-suave">Sin cristales vendidos en este período.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {desglose.cristales.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-sm">
                    <span className="flex-1 truncate">{c.descripcion}</span>
                    <span className="font-semibold">{clp(c.costo)}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-bold">
              <span>Subtotal cristales</span>
              <span>{clp(desglose.totalCristales)}</span>
            </div>
            <div className="flex items-center justify-between px-3 py-1 text-sm">
              <span>+ Marcos ({clp(4000)} c/u, absorbido en el cristal)</span>
              <span className="font-semibold">{clp(desglose.totalArmazones)}</span>
            </div>
            {desglose.totalOtros > 0 && (
              <div className="flex items-center justify-between px-3 py-1 text-sm">
                <span>+ Otros productos (costo de Inventario)</span>
                <span className="font-semibold">{clp(desglose.totalOtros)}</span>
              </div>
            )}
            <div className="mt-1 flex items-center justify-between rounded-lg bg-brand/10 px-3 py-2 text-base font-bold text-brand-dark">
              <span>= Costo directo</span>
              <span>{clp(desglose.total)}</span>
            </div>
          </div>
        </details>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Cristales más vendidos</h2>
        {rankingCristales.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            Sin cristales vendidos en este período.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {rankingCristales.map(([nombre, datos]) => (
              <li key={nombre} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="min-w-40 flex-1">{nombre}</span>
                <span className="text-xs text-tinta-suave">
                  {datos.unidades} unidad{datos.unidades === 1 ? "" : "es"}
                </span>
                <span className="font-semibold">{clp(datos.vendido)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Ventas por vendedor</h2>
        {rankingVendedores.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin ventas en el período.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {rankingVendedores.map(([nombre, datos]) => (
              <li key={nombre} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="min-w-32 flex-1">{nombre}</span>
                <span className="text-xs text-tinta-suave">
                  {datos.ventas} venta{datos.ventas === 1 ? "" : "s"}
                </span>
                <span className="font-semibold">{clp(datos.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
