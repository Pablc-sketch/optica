import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import BotonImprimir from "@/components/boton-imprimir";
import { fechaLegible, finDelDia, hoyEnChile, inicioDelDia } from "@/lib/fechas";

// Reportes (spec pantalla 10). Acá recién sirven los costos que quedaron
// guardados sin mostrarse en la interfaz: el costo del armazón y el costo
// de laboratorio del cristal permiten estimar la utilidad real de cada
// período, no solo lo facturado.

function inicioDeMes(): string {
  const hoy = hoyEnChile();
  return `${hoy.slice(0, 7)}-01`;
}

type ItemVenta = {
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  productos: { costo: number } | { costo: number }[] | null;
  ordenes_trabajo:
    | { costo_laboratorio: number; tipo_lente: string | null; tratamiento: string | null }
    | { costo_laboratorio: number; tipo_lente: string | null; tratamiento: string | null }[]
    | null;
};

// supabase-js tipa las relaciones como objeto o arreglo según el caso.
function uno<T>(rel: T | T[] | null): T | null {
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

function Tarjeta({
  titulo,
  valor,
  detalle,
  acento,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  acento?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <p className="text-sm text-tinta-suave">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${acento ? "text-brand-dark" : ""}`}>{valor}</p>
      {detalle && <p className="text-xs text-tinta-suave">{detalle}</p>}
    </div>
  );
}

export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const desde = params.desde || inicioDeMes();
  const hasta = params.hasta || hoyEnChile();

  const supabase = await createClient();

  const [ventasRes, itemsRes, pagosRes] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, total, estado_pago, vendedor_id, users:vendedor_id (nombre)")
      .gte("fecha", inicioDelDia(desde))
      .lte("fecha", finDelDia(hasta)),
    supabase
      .from("venta_items")
      .select(
        `cantidad, precio_unitario, descuento,
         productos:producto_id (costo),
         ordenes_trabajo:ot_id (costo_laboratorio, tipo_lente, tratamiento),
         ventas!inner (fecha)`
      )
      .gte("ventas.fecha", inicioDelDia(desde))
      .lte("ventas.fecha", finDelDia(hasta)),
    supabase
      .from("pagos_abonos")
      .select("monto")
      .gte("fecha", inicioDelDia(desde))
      .lte("fecha", finDelDia(hasta)),
  ]);

  const ventas = ventasRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as ItemVenta[];
  const pagos = pagosRes.data ?? [];

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const numVentas = ventas.length;
  const ticketPromedio = numVentas > 0 ? Math.round(totalVendido / numVentas) : 0;
  const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0);
  const porCobrar = ventas
    .filter((v) => v.estado_pago !== "pagada")
    .reduce((s, v) => s + v.total, 0);

  // Costo directo: armazones a su costo de compra + cristales a lo que
  // cobra el laboratorio. No incluye arriendo, sueldos ni gastos fijos.
  let costoDirecto = 0;
  for (const item of items) {
    const producto = uno(item.productos);
    const ot = uno(item.ordenes_trabajo);
    if (producto) costoDirecto += producto.costo * item.cantidad;
    if (ot) costoDirecto += ot.costo_laboratorio;
  }
  const utilidadBruta = totalVendido - costoDirecto;
  const margen = totalVendido > 0 ? Math.round((utilidadBruta / totalVendido) * 100) : 0;

  // Ranking de cristales por tratamiento vendido.
  const porTratamiento = new Map<string, { unidades: number; vendido: number }>();
  for (const item of items) {
    const ot = uno(item.ordenes_trabajo);
    if (!ot?.tratamiento) continue;
    const clave = `${ot.tipo_lente ?? ""} · ${ot.tratamiento}`.trim();
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
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Ver
            </button>
          </form>
          <BotonImprimir />
        </div>
      </div>

      <p className="text-sm text-tinta-suave">
        Período: {fechaLegible(desde)} al {fechaLegible(hasta)}
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta titulo="Vendido" valor={clp(totalVendido)} detalle={`${numVentas} venta${numVentas === 1 ? "" : "s"}`} />
        <Tarjeta titulo="Ticket promedio" valor={clp(ticketPromedio)} />
        <Tarjeta titulo="Cobrado en el período" valor={clp(totalAbonado)} />
        <Tarjeta titulo="Por cobrar" valor={clp(porCobrar)} acento={porCobrar > 0} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Utilidad estimada</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tarjeta titulo="Costo directo" valor={clp(costoDirecto)} detalle="armazones + laboratorio" />
          <Tarjeta titulo="Utilidad bruta" valor={clp(utilidadBruta)} acento />
          <Tarjeta titulo="Margen" valor={`${margen}%`} detalle="sobre lo vendido" />
        </div>
        <p className="mt-2 text-xs text-tinta-suave">
          No incluye arriendo, sueldos ni otros gastos fijos: es el margen que deja la mercadería
          vendida en el período.
        </p>
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
