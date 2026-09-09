import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import BotonImprimir from "@/components/boton-imprimir";
import Tarjeta from "@/components/tarjeta";
import {
  fechaLegible,
  finDelDia,
  hoyEnChile,
  inicioDelDia,
  mesEnChile,
  primerDiaDelMes,
  ultimoDiaDelMes,
} from "@/lib/fechas";
import { desglosarCostos, type ItemConCosto } from "@/lib/costo-venta";
import { calcularSueldos, sumarDesgloses, type BaseComision } from "@/lib/sueldos";
import {
  actualizarComisionMedioPago,
  crearGastoGlobal,
  crearRetiro,
  eliminarGastoGlobal,
  eliminarRetiro,
} from "@/lib/actions/gastos";
import FiltroPagos from "./filtro-pagos";

const PERSONAS: Record<string, string> = { isadora: "Isadora", madre: "Mamá", pablo: "Pablo", ahorro: "Ahorro (negocio)" };
const MEDIOS_PAGO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
};

// Reportes (spec pantalla 10). Acá recién sirven los costos que quedaron
// guardados sin mostrarse en la interfaz: el costo del armazón y el costo
// de laboratorio del cristal permiten estimar la utilidad real de cada
// período, no solo lo facturado.

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
  searchParams: Promise<{ desde?: string; hasta?: string; operativo_id?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const desde = params.desde || inicioDeMes();
  const hasta = params.hasta || hoyEnChile();
  const operativoId = params.operativo_id || "";
  // Los sueldos se calculan por mes calendario, no por el rango desde/hasta
  // de arriba (que es libre): un mes con más operativos deja más plata, y
  // el mes siguiente vuelve a partir de cero, así que necesita su propio
  // selector.
  const mes = params.mes || mesEnChile();

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

  // Para descontar de "Efectivo"/"En cuenta" lo que ya salió de esa misma
  // caja en el período — un retiro en efectivo baja el efectivo disponible
  // aunque el sueldo del que salió se calcule por mes, no por este rango.
  const retirosPeriodoQuery = supabase
    .from("retiros_sueldo")
    .select("monto, medio_pago")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const gastosGlobalesPeriodoQuery = supabase
    .from("gastos_globales")
    .select("monto, medio_pago")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  // Sueldos: la comisión de cada operativo se paga el día que se entregan
  // los lentes (fecha_entrega_estimada), no el día del operativo — un
  // operativo de fin de mes con entrega a la semana siguiente paga en el
  // mes que viene, no en el que se hizo. Sin fecha de entrega (caso raro),
  // se usa la fecha del operativo como respaldo. Se trae todo y se filtra
  // en el servidor por esa fecha efectiva porque no es una sola columna.
  const operativosTodosQuery = supabase
    .from("operativos")
    .select(
      "id, nombre, fecha, fecha_fin, fecha_entrega_estimada, comision_vendedora_pct, comision_vendedora_base, ahorro_pct, costo_transporte, costo_arriendo, costo_viaticos, costo_otros"
    )
    .order("fecha", { ascending: true });

  // Gastos que no nacen de un operativo puntual (reponer stock, arriendos
  // fijos, etc.) y retiros de sueldo por adelantado — los dos por mes
  // calendario, igual que los sueldos.
  const gastosGlobalesQuery = supabase
    .from("gastos_globales")
    .select("id, fecha, categoria, descripcion, monto, medio_pago")
    .gte("fecha", primerDiaDelMes(mes))
    .lte("fecha", ultimoDiaDelMes(mes))
    .order("fecha", { ascending: false });
  const retirosQuery = supabase
    .from("retiros_sueldo")
    .select("id, persona, fecha, monto, medio_pago, motivo, operativo_id, operativos:operativo_id (nombre)")
    .gte("fecha", primerDiaDelMes(mes))
    .lte("fecha", ultimoDiaDelMes(mes))
    .order("fecha", { ascending: false });

  const [
    ventasRes,
    itemsRes,
    pagosRes,
    operativosRes,
    operativosTodosRes,
    gastosGlobalesRes,
    retirosRes,
    retirosPeriodoRes,
    gastosGlobalesPeriodoRes,
    tenantRes,
  ] = await Promise.all([
    ventasQuery,
    itemsQuery,
    pagosQuery,
    supabase.from("operativos").select("id, nombre").order("fecha", { ascending: false }),
    operativosTodosQuery,
    gastosGlobalesQuery,
    retirosQuery,
    retirosPeriodoQuery,
    gastosGlobalesPeriodoQuery,
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
  ]);
  const operativos = operativosRes.data ?? [];

  const ventas = ventasRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as ItemVenta[];
  const pagos = pagosRes.data ?? [];
  // La comisión de cada operativo se paga el día que se entregan los
  // lentes, no el día del operativo — así que el mes que corresponde es
  // el de fecha_entrega_estimada, con la fecha del operativo como
  // respaldo si por algo no está definida.
  const fechaDePago = (o: { fecha: string; fecha_entrega_estimada: string | null }) =>
    o.fecha_entrega_estimada ?? o.fecha;
  const operativosDelMes = (operativosTodosRes.data ?? []).filter((o) => {
    const f = fechaDePago(o);
    return f >= primerDiaDelMes(mes) && f <= ultimoDiaDelMes(mes);
  });
  const gastosGlobales = gastosGlobalesRes.data ?? [];
  const retiros = retirosRes.data ?? [];
  const comisionDebitoPct = Number(tenantRes.data?.comision_debito_pct ?? 0);
  const comisionCreditoPct = Number(tenantRes.data?.comision_credito_pct ?? 0);
  const totalGastosGlobales = gastosGlobales.reduce((s, g) => s + g.monto, 0);
  const retirosPorPersona = new Map<string, number>();
  for (const r of retiros) {
    retirosPorPersona.set(r.persona, (retirosPorPersona.get(r.persona) ?? 0) + r.monto);
  }

  // Venta total y costo real de CADA operativo del mes, para poder
  // calcularle el sueldo a cada uno con sus propios porcentajes (pueden
  // cambiar de un operativo a otro) y después sumar el total del mes por
  // persona. Una sola consulta para todos, agrupada en el cliente, en vez
  // de una consulta por operativo.
  const idsOperativosMes = operativosDelMes.map((o) => o.id);
  const [ventasMesRes, itemsMesRes] = idsOperativosMes.length
    ? await Promise.all([
        supabase.from("ventas").select("total, operativo_id").eq("anulada", false).in("operativo_id", idsOperativosMes),
        supabase
          .from("venta_items")
          .select(
            `cantidad, precio_unitario, descuento, cristal_slot,
             productos:producto_id (costo, categoria),
             ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
             ventas!inner (operativo_id, anulada)`
          )
          .eq("ventas.anulada", false)
          .in("ventas.operativo_id", idsOperativosMes),
      ])
    : [{ data: [] as { total: number; operativo_id: string | null }[] }, { data: [] as unknown[] }];
  const ventasMes = ventasMesRes.data ?? [];
  const itemsMes = (itemsMesRes.data ?? []) as unknown as (ItemConCosto & {
    ventas: { operativo_id: string | null } | { operativo_id: string | null }[] | null;
  })[];

  const itemsPorOperativo = new Map<string, ItemConCosto[]>();
  for (const item of itemsMes) {
    const rel = Array.isArray(item.ventas) ? item.ventas[0] : item.ventas;
    const opId = rel?.operativo_id;
    if (!opId) continue;
    if (!itemsPorOperativo.has(opId)) itemsPorOperativo.set(opId, []);
    itemsPorOperativo.get(opId)!.push(item);
  }
  const ventaPorOperativo = new Map<string, number>();
  for (const v of ventasMes) {
    if (!v.operativo_id) continue;
    ventaPorOperativo.set(v.operativo_id, (ventaPorOperativo.get(v.operativo_id) ?? 0) + v.total);
  }

  const sueldosPorOperativo = operativosDelMes.map((o) => {
    const ventaTotal = ventaPorOperativo.get(o.id) ?? 0;
    const costoProductos = desglosarCostos(itemsPorOperativo.get(o.id) ?? []).total;
    const costoOperativo = o.costo_transporte + o.costo_arriendo + o.costo_viaticos + o.costo_otros;
    const utilidadNeta = ventaTotal - costoProductos - costoOperativo;
    const sueldo = calcularSueldos(ventaTotal, utilidadNeta, {
      comisionVendedoraPct: Number(o.comision_vendedora_pct),
      comisionVendedoraBase: o.comision_vendedora_base as BaseComision,
      ahorroPct: Number(o.ahorro_pct),
    });
    return { operativo: o, sueldo };
  });
  const sueldoMesTotal = sumarDesgloses(sueldosPorOperativo.map((s) => s.sueldo));

  // Lo que cada persona ya sacó por adelantado (retiros_sueldo) se resta de
  // lo que le corresponde este mes — un retiro no es un gasto del negocio,
  // es plata que ya era suya y se la llevó antes de que se calculara el
  // reparto. Nunca queda negativo: si sacó más de lo que le tocaba, ese
  // exceso no se le "cobra" acá (es una conversación aparte con esa
  // persona, no algo que el reporte deba mostrar en rojo).
  const pendientePorPersona = {
    isadora: Math.max(0, sueldoMesTotal.comisionIsadora - (retirosPorPersona.get("isadora") ?? 0)),
    madre: Math.max(0, sueldoMesTotal.parteMadre - (retirosPorPersona.get("madre") ?? 0)),
    pablo: Math.max(0, sueldoMesTotal.partePablo - (retirosPorPersona.get("pablo") ?? 0)),
  };

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
  // Plata disponible en la mano ahora: efectivo aparte porque es la única
  // que se puede usar al tiro (débito/crédito/transferencia demoran en
  // liquidarse a la cuenta, aunque el sistema ya los cuente como cobrados).
  const cobradoEfectivo = pagos.filter((p) => p.medio_pago === "efectivo").reduce((s, p) => s + p.monto, 0);
  const cobradoCuenta = totalAbonado - cobradoEfectivo;
  // Lo que ya salió de cada caja en este período (retiros de sueldo por
  // adelantado + gastos globales), para que "Efectivo"/"En cuenta" muestren
  // lo que de verdad queda y no solo lo cobrado — sin esto había que
  // restar los retiros a mano cada vez para saber cuánto había en realidad.
  const retirosPeriodo = retirosPeriodoRes.data ?? [];
  const gastosGlobalesPeriodo = gastosGlobalesPeriodoRes.data ?? [];
  // Los gastos propios de cada operativo (arriendo de equipos, transporte,
  // viáticos, otros) también salen de la cuenta — nunca de efectivo — y se
  // pagan al terminar el operativo (o el mismo día si dura uno solo). Sin
  // esto "En cuenta" no bajaba con el arriendo de $108.000 de Pudahuel,
  // aunque ese dinero ya había salido de la cuenta real.
  const gastosOperativoPeriodo = (operativosTodosRes.data ?? [])
    .filter((o) => {
      const f = o.fecha_fin ?? o.fecha;
      return f >= desde && f <= hasta;
    })
    .reduce((s, o) => s + o.costo_transporte + o.costo_arriendo + o.costo_viaticos + o.costo_otros, 0);
  const salidaEfectivo =
    retirosPeriodo.filter((r) => r.medio_pago === "efectivo").reduce((s, r) => s + r.monto, 0) +
    gastosGlobalesPeriodo.filter((g) => g.medio_pago === "efectivo").reduce((s, g) => s + g.monto, 0);
  const salidaCuenta =
    retirosPeriodo.filter((r) => r.medio_pago && r.medio_pago !== "efectivo").reduce((s, r) => s + r.monto, 0) +
    gastosGlobalesPeriodo.filter((g) => g.medio_pago && g.medio_pago !== "efectivo").reduce((s, g) => s + g.monto, 0) +
    gastosOperativoPeriodo;
  // Lo que el procesador de tarjeta (Mercado Pago) se queda antes de
  // depositar: casi nunca es lo mismo por débito que por crédito (el
  // débito suele liquidarse sin comisión; la comisión real está en el
  // crédito), así que se calculan por separado. Verificado con la boleta
  // real de Pudahuel: sin este descuento "En cuenta" quedaba $1.055 por
  // sobre el saldo real, y un 2% solo sobre el crédito explicó $960 de
  // esa diferencia.
  const cobradoDebito = pagos.filter((p) => p.medio_pago === "debito").reduce((s, p) => s + p.monto, 0);
  const cobradoCredito = pagos.filter((p) => p.medio_pago === "credito").reduce((s, p) => s + p.monto, 0);
  const comisionTarjeta = Math.round(
    (cobradoDebito * comisionDebitoPct + cobradoCredito * comisionCreditoPct) / 100
  );
  const totalEfectivo = cobradoEfectivo - salidaEfectivo;
  const totalCuenta = cobradoCuenta - salidaCuenta - comisionTarjeta;
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
          <div className="mt-3 border-t border-tinta-suave/15 pt-3">
            <FiltroPagos pagos={pagosDetalle} />
          </div>
        </details>
        <Tarjeta icono="⏳" titulo="Por cobrar" valor={clp(porCobrar)} acento={porCobrar > 0} />
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Plata disponible hasta ahora</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tarjeta icono="💰" titulo="Total cobrado" valor={clp(totalAbonado)} acento />
          <Tarjeta
            icono="🏦"
            titulo="En cuenta"
            valor={clp(totalCuenta)}
            detalle={
              salidaCuenta > 0 || comisionTarjeta > 0
                ? [
                    `${clp(cobradoCuenta)} cobrado`,
                    comisionTarjeta > 0 ? `− ${clp(comisionTarjeta)} comisión tarjeta` : null,
                    salidaCuenta > 0 ? `− ${clp(salidaCuenta)} retirado/gastado` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "débito + crédito + transferencia"
            }
          />
          <Tarjeta
            icono="💵"
            titulo="Efectivo"
            valor={clp(totalEfectivo)}
            detalle={
              salidaEfectivo > 0
                ? `${clp(cobradoEfectivo)} cobrado − ${clp(salidaEfectivo)} retirado/gastado`
                : "lo único disponible al tiro"
            }
          />
        </div>
        <details className="mt-2 rounded-2xl bg-crema-claro p-3 text-sm shadow-sm print:hidden">
          <summary className="cursor-pointer font-medium text-tinta-suave">
            ✎ Comisión de la máquina POS ({comisionDebitoPct}% débito, {comisionCreditoPct}% crédito)
          </summary>
          <p className="mt-2 text-xs text-tinta-suave">
            Lo que Mercado Pago descuenta antes de depositar en la cuenta — casi siempre distinto por
            débito que por crédito. &quot;En cuenta&quot; de arriba ya lo resta solo.
          </p>
          <form action={actualizarComisionMedioPago} className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              % débito
              <input
                name="comision_debito_pct"
                inputMode="decimal"
                defaultValue={comisionDebitoPct}
                className="w-20 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              % crédito
              <input
                name="comision_credito_pct"
                inputMode="decimal"
                defaultValue={comisionCreditoPct}
                className="w-20 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Guardar
            </button>
          </form>
        </details>
      </section>

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

      <section className="print:hidden">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Sueldos del mes</h2>
          <form className="flex items-center gap-2" action="/reportes">
            {/* El resto de filtros de la página (desde/hasta/operativo) no
                deben perderse al cambiar solo el mes de sueldos. */}
            <input type="hidden" name="desde" value={desde} />
            <input type="hidden" name="hasta" value={hasta} />
            {operativoId && <input type="hidden" name="operativo_id" value={operativoId} />}
            <label className="flex items-center gap-1 text-sm">
              Mes
              <input
                type="month"
                name="mes"
                defaultValue={mes}
                className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Ver
            </button>
          </form>
        </div>
        <p className="mb-2 text-xs text-tinta-suave">
          Se calcula por el mes en que se PAGA cada operativo — el día que se entregan los lentes, no el
          día del operativo — y el mes que viene se vuelve a partir de cero. Los porcentajes de cada
          operativo se editan en su propio detalle.
        </p>
        {operativosDelMes.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            Sin operativos en este mes.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tarjeta
                icono="🧑‍💼"
                titulo="Isadora · por entregar"
                valor={clp(pendientePorPersona.isadora)}
                detalle={`de ${clp(sueldoMesTotal.comisionIsadora)}${(retirosPorPersona.get("isadora") ?? 0) > 0 ? ` · ya retiró ${clp(retirosPorPersona.get("isadora") ?? 0)}` : ""}`}
              />
              <Tarjeta
                icono="👩"
                titulo="Mamá · por entregar"
                valor={clp(pendientePorPersona.madre)}
                detalle={`de ${clp(sueldoMesTotal.parteMadre)}${(retirosPorPersona.get("madre") ?? 0) > 0 ? ` · ya retiró ${clp(retirosPorPersona.get("madre") ?? 0)}` : ""}`}
              />
              <Tarjeta
                icono="🧑"
                titulo="Pablo · por entregar"
                valor={clp(pendientePorPersona.pablo)}
                detalle={`de ${clp(sueldoMesTotal.partePablo)}${(retirosPorPersona.get("pablo") ?? 0) > 0 ? ` · ya retiró ${clp(retirosPorPersona.get("pablo") ?? 0)}` : ""}`}
              />
              <Tarjeta
                icono="🏦"
                titulo="Ahorro del negocio"
                valor={clp(sueldoMesTotal.ahorro)}
                detalle={
                  (retirosPorPersona.get("ahorro") ?? 0) > 0
                    ? `${clp(retirosPorPersona.get("ahorro") ?? 0)} ya apartado`
                    : "acumulado, todavía no apartado — sigue mezclado en la caja"
                }
                acento
              />
            </div>
            <div className="mt-3 overflow-x-auto rounded-2xl bg-crema-claro p-3 shadow-sm">
              <table className="w-full min-w-150 text-sm">
                <thead>
                  <tr className="text-left text-tinta-suave">
                    <th className="py-1.5 pr-2">Operativo</th>
                    <th className="py-1.5 pr-2 text-right">Vendido</th>
                    <th className="py-1.5 pr-2 text-right">Utilidad neta</th>
                    <th className="py-1.5 pr-2 text-right">Isadora</th>
                    <th className="py-1.5 pr-2 text-right">Ahorro</th>
                    <th className="py-1.5 pr-2 text-right">Mamá</th>
                    <th className="py-1.5 text-right">Pablo</th>
                  </tr>
                </thead>
                <tbody>
                  {sueldosPorOperativo.map(({ operativo: o, sueldo }) => (
                    <tr key={o.id} className="border-t border-tinta-suave/10">
                      <td className="py-1.5 pr-2">
                        <a href={`/operativos/${o.id}`} className="hover:underline">
                          {o.nombre}
                        </a>
                        <span className="ml-1 text-xs text-tinta-suave">
                          se paga {fechaLegible(fechaDePago(o))}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right">{clp(sueldo.ventaTotal)}</td>
                      <td className={`py-1.5 pr-2 text-right ${sueldo.utilidadNeta < 0 ? "text-red-700" : ""}`}>
                        {clp(sueldo.utilidadNeta)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">{clp(sueldo.comisionIsadora)}</td>
                      <td className="py-1.5 pr-2 text-right">{clp(sueldo.ahorro)}</td>
                      <td className="py-1.5 pr-2 text-right">{clp(sueldo.parteMadre)}</td>
                      <td className="py-1.5 text-right">{clp(sueldo.partePablo)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-tinta-suave/20 font-bold">
                    <td className="py-1.5 pr-2">Total del mes</td>
                    <td className="py-1.5 pr-2 text-right">{clp(sueldoMesTotal.ventaTotal)}</td>
                    <td className={`py-1.5 pr-2 text-right ${sueldoMesTotal.utilidadNeta < 0 ? "text-red-700" : ""}`}>
                      {clp(sueldoMesTotal.utilidadNeta)}
                    </td>
                    <td className="py-1.5 pr-2 text-right">{clp(sueldoMesTotal.comisionIsadora)}</td>
                    <td className="py-1.5 pr-2 text-right">{clp(sueldoMesTotal.ahorro)}</td>
                    <td className="py-1.5 pr-2 text-right">{clp(sueldoMesTotal.parteMadre)}</td>
                    <td className="py-1.5 text-right">{clp(sueldoMesTotal.partePablo)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="print:hidden">
        <h2 className="mb-1 font-semibold">Gastos globales del mes</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          Costos que no nacen de un operativo puntual — reponer marcos/bandejas, arriendos fijos, etc.
          Se restan de la plata del negocio, pero no de la utilidad de ningún operativo en particular
          (usa el mismo mes de arriba).
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Tarjeta icono="📦" titulo="Total del mes" valor={clp(totalGastosGlobales)} acento />
          <div className="rounded-2xl bg-crema-claro p-3 shadow-sm lg:col-span-2">
            <form action={crearGastoGlobal} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input
                type="date"
                name="fecha"
                required
                defaultValue={hoyEnChile()}
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
              <select
                name="categoria"
                defaultValue="compra_inventario"
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="compra_inventario">Compra de inventario</option>
                <option value="arriendo">Arriendo</option>
                <option value="otro">Otro</option>
              </select>
              <input
                name="descripcion"
                placeholder="Ej. 24 marcos nuevos"
                required
                className="col-span-2 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand sm:col-span-2"
              />
              <input
                name="monto"
                inputMode="numeric"
                placeholder="78.000"
                required
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
              <select
                name="medio_pago"
                defaultValue=""
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              >
                <option value="">Medio de pago…</option>
                {Object.entries(MEDIOS_PAGO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="col-span-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark sm:col-span-1">
                Agregar
              </button>
            </form>
          </div>
        </div>
        {gastosGlobales.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {gastosGlobales.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-xs text-tinta-suave">{fechaLegible(g.fecha)}</span>
                <span className="flex-1">{g.descripcion}</span>
                {g.medio_pago && (
                  <span className="text-xs text-tinta-suave">{MEDIOS_PAGO_LABEL[g.medio_pago]}</span>
                )}
                <span className="font-semibold">{clp(g.monto)}</span>
                <form action={eliminarGastoGlobal}>
                  <input type="hidden" name="id" value={g.id} />
                  <button className="text-xs font-medium text-red-700 hover:underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="print:hidden">
        <h2 className="mb-1 font-semibold">Retiros y aportes del mes</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          <strong>Retiro:</strong> Isadora, la mamá o Pablo sacan plata por adelantado contra lo que les
          corresponde de sueldo (o se aparta el ahorro del negocio) — se descuenta de arriba.{" "}
          <strong>Aporte:</strong> esa persona pone plata propia al negocio (ej. cubrir una diferencia al
          pagar al laboratorio) — se SUMA a lo que se le debe, en vez de restarse.
        </p>
        <div className="rounded-2xl bg-crema-claro p-3 shadow-sm">
          <form action={crearRetiro} className="grid grid-cols-2 gap-2 sm:grid-cols-7">
            <select
              name="persona"
              defaultValue="isadora"
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            >
              {Object.entries(PERSONAS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              name="tipo"
              defaultValue="retiro"
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            >
              <option value="retiro">Retiro (saca)</option>
              <option value="aporte">Aporte (pone)</option>
            </select>
            <input
              type="date"
              name="fecha"
              required
              defaultValue={hoyEnChile()}
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <input
              name="monto"
              inputMode="numeric"
              placeholder="20.000"
              required
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <select
              name="medio_pago"
              defaultValue=""
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            >
              <option value="">Medio…</option>
              {Object.entries(MEDIOS_PAGO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              name="motivo"
              placeholder="Motivo (opcional)"
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <button className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark">
              Agregar
            </button>
          </form>
        </div>
        {retiros.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {retiros.map((r) => {
              const operativoNombre = uno(
                r.operativos as unknown as { nombre: string } | { nombre: string }[] | null
              )?.nombre;
              const esAporte = r.monto < 0;
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="text-xs text-tinta-suave">{fechaLegible(r.fecha)}</span>
                  <span className="font-medium">{PERSONAS[r.persona] ?? r.persona}</span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${esAporte ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}
                  >
                    {esAporte ? "Aporte" : "Retiro"}
                  </span>
                  <span className="flex-1 text-xs text-tinta-suave">
                    {[r.motivo, operativoNombre ? `contra ${operativoNombre}` : null, r.medio_pago ? MEDIOS_PAGO_LABEL[r.medio_pago] : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="font-semibold">{clp(Math.abs(r.monto))}</span>
                  <form action={eliminarRetiro}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="text-xs font-medium text-red-700 hover:underline">Quitar</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
