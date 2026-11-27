import { esPilotoTerreno } from "@/lib/piloto-terreno";
import Link from "next/link";
import { fechaValidaDocumento } from "@/lib/fecha-documentos";
import { createClient } from "@/lib/supabase/server";
import { exigirRolPagina } from "@/lib/autorizacion";
import { clp } from "@/lib/clp";
import BotonEnviar from "@/components/boton-enviar";
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
import { desglosarCostos } from "@/lib/costo-venta";
import { calcularCaja, resumirCaja } from "@/lib/caja";
import { salidasDeMovimiento } from "@/lib/caja-fuentes";
import { leerTodas } from "@/lib/leer-todas";
import {
  actualizarComisionMedioPago,
  crearGastoGlobal,
  crearRetiro,
  eliminarGastoGlobal,
  eliminarRetiro,
} from "@/lib/actions/gastos";
import { esVentaDeConsulta } from "@/lib/consulta";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { PERSONAS_REPARTO } from "@/lib/reparto";
import CajaFormulario from "@/components/caja-formulario";
import { asociarRetiroHistorico } from "@/lib/actions/reparto";
import FiltroPagos from "./filtro-pagos";

const PERSONAS: Record<string, string> = {
  isadora: "Isadora",
  madre: "Pamela (mamá)",
  pablo: "Pablo",
  ahorro: "Ahorro (negocio)",
};
const CAJAS_LABEL: Record<string, string> = { efectivo: "Efectivo", digital: "Cuenta bancaria (Mercado Pago)", personal: "Dinero personal de Pablo" };
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
  ventas: {operativo_id:string|null} | {operativo_id:string|null}[] | null;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  cristal_slot: number | null;
  productos: { costo: number; categoria: string } | { costo: number; categoria: string }[] | null;
  ordenes_trabajo: OTResumen | OTResumen[] | null;
};

// Tarjeta de sueldo de una persona, con el botón para marcarlo pagado.
//
// Pagar el sueldo es exactamente el mismo movimiento que un adelanto — sale
// plata de una caja y baja lo que se le debe — así que se guarda en la
// misma tabla. Lo único que cambia es que queda marcado como sueldo, para
// que la tarjeta pueda decir "pagado" en vez de "ya retiró".
//
// La caja se elige en el mismo botón y es obligatoria: es la pregunta que
// hay que contestar sí o sí para que el cuadre de mañana siga en pie
// ("¿esos $56.000 salieron del sobre o de la cuenta?").
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
  const hasta = fechaValidaDocumento(params.hasta) ? params.hasta : hoyEnChile();
  const desdeElegido = fechaValidaDocumento(params.desde) ? params.desde : inicioDeMes();
  const desde = desdeElegido <= hasta ? desdeElegido : hasta;
  const operativoId = params.operativo_id || "";
  // Los sueldos se calculan por mes calendario, no por el rango desde/hasta
  // de arriba (que es libre): un mes con más operativos deja más plata, y
  // el mes siguiente vuelve a partir de cero, así que necesita su propio
  // selector.
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes ?? "") ? params.mes! : mesEnChile();

  // Costos y utilidades: solo administración (A09).
  const {tenantId} = await exigirRolPagina(["admin"]);
  const piloto = esPilotoTerreno(tenantId);
  const supabase = await createClient();

  let ventasQuery = supabase
    .from("ventas")
    .select("id, total, vendedor_id, users:vendedor_id (nombre), pagos_abonos (monto), venta_items (descripcion)")
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
    .select("monto, caja")
    .gte("fecha", desde)
    .lte("fecha", hasta);
  const gastosGlobalesPeriodoQuery = supabase
    .from("gastos_globales")
    .select("monto, caja")
    .gte("fecha", desde)
    .lte("fecha", hasta);

  // Caja global: todo lo que entró y salió desde el primer día, sin el
  // filtro de fechas de arriba. Es la pregunta de todos los días —
  // "¿cuánta plata hay AHORA, en la mano y en la cuenta?" — y un rango
  // que parte el 1 del mes no la responde: la plata del mes pasado que
  // todavía no se gasta sigue existiendo.
  //
  // La suma la hace la base (función caja_global()) y no esta página:
  // traer todos los pagos para sumarlos acá se topaba con el corte de
  // 1.000 filas de PostgREST, y el día que se pasara ese número la caja
  // habría mostrado menos plata de la real sin decir nada.
  const cajaGlobalQuery = supabase.rpc("caja_global").single();

  const operativosTodosQuery = supabase
    .from("operativos")
    .select(
      "id, nombre, fecha, fecha_fin, chequeo_id, estado, costo_fides_real, costo_marco_unitario"
    )
    .order("fecha", { ascending: true });

  // Gastos que no nacen de un operativo puntual (reponer stock, arriendos
  // fijos, etc.) y retiros de sueldo por adelantado — los dos por mes
  // calendario, igual que los sueldos.
  const gastosGlobalesQuery = supabase
    .from("gastos_globales")
    .select("id, fecha, categoria, descripcion, monto, medio_pago, caja")
    .gte("fecha", primerDiaDelMes(mes))
    .lte("fecha", ultimoDiaDelMes(mes))
    .order("fecha", { ascending: false });
  const retirosQuery = supabase
    .from("retiros_sueldo")
    .select(
      "id, persona, fecha, monto, medio_pago, caja, es_sueldo, motivo, operativo_id, chequeo_id, reparto_verificado, operativos:operativo_id (nombre), chequeos:chequeo_id (nombre)"
    )
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
    cajaGlobalRes,
    movimientosCajaRes,
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
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct, reparto_etiquetas").single(),
    cajaGlobalQuery,
    leerTodas((a,b) => supabase.from("caja_movimientos").select("tipo,monto,caja,id").gte("fecha",desde).lte("fecha",hasta).order("id").range(a,b)),
  ]);
  const operativos = operativosRes.data ?? [];

  const ventas = ventasRes.data ?? [];
  const items = (itemsRes.data ?? []) as unknown as ItemVenta[];
  const pagos = pagosRes.data ?? [];
  const operativosDelMes = (operativosTodosRes.data ?? []).filter(o =>
    o.estado !== "cancelado" && o.fecha <= ultimoDiaDelMes(mes) && (o.fecha_fin ?? o.fecha) >= primerDiaDelMes(mes));
  const destinosMes = [...new Map(operativosDelMes.map(o => [o.chequeo_id ?? o.id, o])).values()];
  const gastosGlobales = gastosGlobalesRes.data ?? [];
  const retiros = retirosRes.data ?? [];
  const comisionDebitoPct = Number(tenantRes.data?.comision_debito_pct ?? 0);
  const comisionCreditoPct = Number(tenantRes.data?.comision_credito_pct ?? 0);
  const totalGastosGlobales = gastosGlobales.reduce((s, g) => s + g.monto, 0);
  const nombresReparto = { ...etiquetasReparto(tenantRes.data?.reparto_etiquetas), ahorro: "Ahorro" };
  const retirosSinAsignar = retiros.filter(r => !r.operativo_id && !r.chequeo_id && r.monto !== 0);
  const gruposRes = await leerTodas((a, b) => supabase.from("chequeos").select("id,nombre,desde")
    .eq("tenant_id", tenantId).order("desde", { ascending: false }).order("id").range(a, b));
  const grupos = gruposRes.data ?? [];
  const pagadoMes = (persona: string) => retiros
    .filter(r => r.persona === persona && r.es_sueldo).reduce((suma, r) => suma + r.monto, 0);


  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  // Ticket de LENTES: sin las ventas que son solo consulta ($5.000).
  const ventasLentes = ventas.filter((v) => !esVentaDeConsulta((v as { venta_items?: { descripcion: string | null }[] }).venta_items));
  const numVentas = ventasLentes.length;
  const ticketPromedio = numVentas > 0 ? Math.round(ventasLentes.reduce((s, v) => s + v.total, 0) / numVentas) : 0;
  const totalAbonado = pagos.reduce((s, p) => s + p.monto, 0);
  // Uno por uno los abonos que arman "Cobrado en el período", para poder
  // revisar de dónde sale la plata (¿está el efectivo que me pagaron?, etc.)
  // en vez de solo confiar en la suma.
  const pagosDetalle = pagos.map((p) => {
    const venta = uno(p.ventas as unknown as { pacientes: { nombre: string } | { nombre: string }[] | null } | { pacientes: { nombre: string } | { nombre: string }[] | null }[] | null);
    const paciente = uno(venta?.pacientes as unknown as { nombre: string } | { nombre: string }[] | null);
    return { fecha: p.fecha, monto: p.monto, medioPago: p.medio_pago, paciente: paciente?.nombre ?? null };
  });
  // Plata del período, partida en las dos cajas: el efectivo es lo único
  // que se puede usar al tiro (débito/crédito/transferencia demoran en
  // liquidarse a la cuenta, aunque el sistema ya los cuente como
  // cobrados). Los retiros y gastos del período bajan la caja de la que
  // salieron — sin esto había que restarlos a mano cada vez para saber
  // cuánto quedaba de verdad.
  const retirosPeriodo = retirosPeriodoRes.data ?? [];
  const gastosGlobalesPeriodo = gastosGlobalesPeriodoRes.data ?? [];
  const cajaPeriodo = calcularCaja({
    entradas: pagos,
    salidas: [...retirosPeriodo, ...gastosGlobalesPeriodo, ...(movimientosCajaRes.data ?? []).flatMap(m => {
      const s = salidasDeMovimiento(m);
      return [{ monto:s.efectivo,caja:"efectivo" },{ monto:s.digital,caja:"digital" }];
    })],
    comisionDebitoPct,
    comisionCreditoPct,
  });

  // Caja global: la misma cuenta pero desde el primer día hasta hoy, sin
  // el filtro de fechas. Es el número con el que se cuadra el sobre del
  // efectivo y el saldo de la cuenta — el del período de arriba sirve
  // para analizar un mes, no para saber cuánta plata hay ahora.
  // Si la consulta de la caja falla, hay que DECIRLO. Mostrar $0 sería la
  // peor salida posible: se vería igual que "no queda plata", y esa es una
  // pantalla sobre la que se toman decisiones con el sobre en la mano.
  const cajaGlobalFallo = Boolean(cajaGlobalRes.error);
  const totalesGlobal = (cajaGlobalRes.data ?? null) as {
    entro_efectivo: number;
    entro_digital: number;
    entro_debito: number;
    entro_credito: number;
    salio_efectivo: number;
    salio_digital: number;
    gastos_operativo: number;
  } | null;
  const cajaGlobal = resumirCaja(
    {
      entroEfectivo: totalesGlobal?.entro_efectivo ?? 0,
      entroDigital: totalesGlobal?.entro_digital ?? 0,
      entroDebito: totalesGlobal?.entro_debito ?? 0,
      entroCredito: totalesGlobal?.entro_credito ?? 0,
      salioEfectivo: totalesGlobal?.salio_efectivo ?? 0,
      salioDigital: totalesGlobal?.salio_digital ?? 0,
    },
    { comisionDebitoPct, comisionCreditoPct }
  );
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
  desglose.totalArmazones = items.reduce((s,item) => {
    const venta = uno(item.ventas);
    const op = (operativosTodosRes.data ?? []).find(o => o.id === venta?.operativo_id);
    return s + desglosarCostos([item], op?.costo_marco_unitario ?? undefined).totalArmazones;
  },0);
  desglose.total = desglose.totalCristales + desglose.totalArmazones + desglose.totalOtros;
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
        <Tarjeta icono="💰" titulo="Vendido" valor={clp(totalVendido)} detalle={`${numVentas} venta${numVentas === 1 ? "" : "s"} de lentes (el monto incluye consultas)`} />
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
        <h2 className="mb-1 font-semibold">Caja registrada</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          Movimientos de Lentia desde el inicio. El saldo de la cuenta se consulta en Caja MP.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl bg-emerald-700 p-4 text-white shadow-[0_2px_10px_-3px_rgba(61,57,41,0.25)]">
            <p className="text-sm font-medium text-emerald-50">💵 Efectivo en mano</p>
            <p className="mt-1 text-3xl font-black">{clp(cajaGlobal.hayEfectivo)}</p>
            <p className="mt-0.5 text-xs text-emerald-100">
              {clp(cajaGlobal.entroEfectivo)} cobrado − {clp(cajaGlobal.salioEfectivo)} sacado
            </p>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-sky-800 p-4 text-white shadow-[0_2px_10px_-3px_rgba(61,57,41,0.25)]">
            <p className="text-sm font-medium text-sky-50">🏦 Cuenta estimada por Lentia</p>
            <p className="mt-1 text-3xl font-black">{clp(cajaGlobal.hayDigital)}</p>
            <p className="mt-0.5 text-xs text-sky-100">
              {clp(cajaGlobal.entroDigital)} cobrado −{" "}
              {clp(cajaGlobal.salioDigital + cajaGlobal.comisionTarjeta)} sacado y comisiones
            </p>
          </div>
          <div className="relative overflow-hidden rounded-3xl bg-tinta p-4 text-white shadow-[0_2px_10px_-3px_rgba(61,57,41,0.25)]">
            <p className="text-sm font-medium text-white/70">🧮 Total del negocio</p>
            <p className="mt-1 text-3xl font-black">{clp(cajaGlobal.total)}</p>
            <p className="mt-0.5 text-xs text-white/60">efectivo + caja digital</p>
          </div>
        </div>
        {cajaGlobalFallo && (
          <p className="mt-2 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
            ⚠ No se pudo leer la caja. Recarga la página.
          </p>
        )}
        {!cajaGlobalFallo && (cajaGlobal.hayEfectivo < 0 || cajaGlobal.hayDigital < 0) && (
          <p className="mt-2 rounded-xl bg-red-100 px-3 py-2 text-sm font-semibold text-red-900">
            ⚠ Una caja quedó en negativo: revisa los retiros y gastos de abajo.
          </p>
        )}
        <details className="mt-2 rounded-2xl bg-crema-claro p-3 text-sm shadow-sm">
          <summary className="cursor-pointer font-medium text-tinta-suave">
            🧾 Ver de dónde sale cada número
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-white p-3">
              <p className="mb-1.5 font-semibold">💵 Efectivo</p>
              <p className="flex justify-between py-0.5">
                <span>Cobrado en efectivo</span>
                <span className="font-semibold">{clp(cajaGlobal.entroEfectivo)}</span>
              </p>
              <p className="flex justify-between py-0.5">
                <span>− Retiros y gastos en efectivo</span>
                <span className="font-semibold">{clp(cajaGlobal.salioEfectivo)}</span>
              </p>
              <p className="mt-1 flex justify-between border-t border-tinta-suave/20 pt-1 font-bold">
                <span>= Queda</span>
                <span>{clp(cajaGlobal.hayEfectivo)}</span>
              </p>
            </div>
            <div className="rounded-xl bg-white p-3">
              <p className="mb-1.5 font-semibold">🏦 Caja digital</p>
              <p className="flex justify-between py-0.5">
                <span>Cobrado por débito, crédito y transferencia</span>
                <span className="font-semibold">{clp(cajaGlobal.entroDigital)}</span>
              </p>
              <p className="flex justify-between py-0.5">
                <span>− Comisión de la máquina</span>
                <span className="font-semibold">{clp(cajaGlobal.comisionTarjeta)}</span>
              </p>
              <p className="flex justify-between py-0.5">
                <span>− Retiros y gastos de la cuenta</span>
                <span className="font-semibold">{clp(cajaGlobal.salioDigital)}</span>
              </p>
              <p className="mt-1 flex justify-between border-t border-tinta-suave/20 pt-1 font-bold">
                <span>= Queda</span>
                <span>{clp(cajaGlobal.hayDigital)}</span>
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-tinta-suave">
            Solo se descuentan pagos registrados. <Link href="/pagos" className="underline">Ver costos pendientes y ahorro →</Link>
          </p>
        </details>
      </section>

      <section>
        <h2 className="mb-1 font-semibold">Flujo del período</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          Solo lo que entró y salió entre {fechaLegible(desde)} y {fechaLegible(hasta)}. Para saber
          el saldo bancario, abre <Link href="/caja" className="underline">Cuenta bancaria (Mercado Pago)</Link>.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Tarjeta icono="💰" titulo="Total cobrado" valor={clp(totalAbonado)} acento />
          <Tarjeta
            icono="🏦"
            titulo="En cuenta"
            valor={clp(cajaPeriodo.hayDigital)}
            detalle={
              cajaPeriodo.salioDigital > 0 || cajaPeriodo.comisionTarjeta > 0
                ? [
                    `${clp(cajaPeriodo.entroDigital)} cobrado`,
                    cajaPeriodo.comisionTarjeta > 0
                      ? `− ${clp(cajaPeriodo.comisionTarjeta)} comisión tarjeta`
                      : null,
                    cajaPeriodo.salioDigital > 0 ? `− ${clp(cajaPeriodo.salioDigital)} retirado/gastado` : null,
                  ]
                    .filter(Boolean)
                    .join(" ")
                : "débito + crédito + transferencia"
            }
          />
          <Tarjeta
            icono="💵"
            titulo="Efectivo"
            valor={clp(cajaPeriodo.hayEfectivo)}
            detalle={
              cajaPeriodo.salioEfectivo > 0
                ? `${clp(cajaPeriodo.entroEfectivo)} cobrado − ${clp(cajaPeriodo.salioEfectivo)} retirado/gastado`
                : "lo único disponible al tiro"
            }
          />
        </div>
        <details className="mt-2 rounded-2xl bg-crema-claro p-3 text-sm shadow-sm print:hidden">
          <summary className="cursor-pointer font-medium text-tinta-suave">
            ✎ Comisión de la máquina POS ({comisionDebitoPct}% débito, {comisionCreditoPct}% crédito)
          </summary>
          <p className="mt-2 text-xs text-tinta-suave">
            Lo que descuenta Mercado Pago. «En cuenta» ya lo resta.
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
          Sin arriendo, sueldos ni gastos fijos.
          {(operativosTodosRes.data ?? []).some(o => o.costo_fides_real != null) && <> Este desglose usa costos por cristal. Los totales corregidos de Fides se aplican al reparto de cada operativo y a las remuneraciones.</>}
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
              <span>+ Marcos ({desglose.marcos}, según costo de cada operativo)</span>
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

      {!piloto && <section className="print:hidden">
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
        <p className="mb-2 text-sm text-tinta-suave">Pagos registrados durante el mes seleccionado.</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PERSONAS_REPARTO.map(persona => <div className="rounded-xl bg-white p-3" key={persona}>
            <dt>{nombresReparto[persona]}</dt><dd className="font-semibold tabular-nums">{clp(pagadoMes(persona))}</dd>
          </div>)}
        </dl>
        {retirosSinAsignar.length > 0 && <p className="my-2 rounded-lg bg-amber-50 p-2 text-sm">
          {retirosSinAsignar.length} movimientos pendientes de asociar a un chequeo u operativo.
        </p>}
        {destinosMes.length > 0 && <ul className="mt-3 space-y-1 text-sm">
          {destinosMes.map(o => <li key={o.id}>
            <Link className="font-semibold underline" href={`/caja?${o.chequeo_id ? "chequeo" : "operativo"}=${o.chequeo_id ?? o.id}#reparto`}>
              {o.chequeo_id ? `Reparto · ${grupos.find(g => g.id === o.chequeo_id)?.nombre ?? o.nombre}` : `Reparto · ${o.nombre}`}
            </Link>
          </li>)}
        </ul>}
      </section>}

      <section className="print:hidden">
        <h2 className="mb-1 font-semibold">Gastos globales del mes</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          Gastos que no son de un operativo (reponer marcos, arriendos fijos).
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Tarjeta icono="📦" titulo="Total del mes" valor={clp(totalGastosGlobales)} acento />
          <div className="rounded-2xl bg-crema-claro p-3 shadow-sm lg:col-span-2">
            <form action={crearGastoGlobal} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <input
                type="date"
                name="fecha"
                required
                defaultValue={hoyEnChile()}
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              aria-label="Fecha del movimiento" />
              <select
                name="categoria"
                defaultValue="compra_inventario"
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
               aria-label="Categoría del gasto">
                <option value="compra_inventario">Compra de inventario</option>
                <option value="arriendo">Arriendo</option>
                <option value="otro">Otro</option>
              </select>
              <input
                name="descripcion"
                placeholder="Ej. 24 marcos nuevos"
                required
                className="col-span-2 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand sm:col-span-2"
              aria-label="Descripción del gasto" />
              <input
                name="monto"
                inputMode="numeric"
                placeholder="78.000"
                required
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              aria-label="Monto en pesos" />
              <select
                name="caja"
                defaultValue="digital"
                aria-label="¿De qué caja salió?"
                className="col-span-1 rounded-lg border-2 border-brand/40 bg-white px-2 py-1.5 text-sm font-medium outline-none focus:border-brand"
              >
                <option value="efectivo">💵 Salió del efectivo</option>
                <option value="digital">🏦 Cuenta bancaria (Mercado Pago)</option>
                <option value="personal">Dinero personal de Pablo</option>
              </select>
              <select
                name="medio_pago"
                defaultValue=""
                className="col-span-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
               aria-label="Medio de pago">
                <option value="">Medio de pago…</option>
                {Object.entries(MEDIOS_PAGO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <BotonEnviar className="col-span-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark sm:col-span-1">Agregar</BotonEnviar>
            </form>
          </div>
        </div>
        {gastosGlobales.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {gastosGlobales.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-xs text-tinta-suave">{fechaLegible(g.fecha)}</span>
                <span className="flex-1">{g.descripcion}</span>
                <span className="rounded-md bg-crema-claro px-1.5 py-0.5 text-xs font-medium text-tinta-suave">
                  {g.caja === "efectivo" ? "💵" : "🏦"} {CAJAS_LABEL[g.caja] ?? g.caja}
                  {g.medio_pago ? ` · ${MEDIOS_PAGO_LABEL[g.medio_pago]}` : ""}
                </span>
                <span className="font-semibold">{clp(g.monto)}</span>
                <form action={eliminarGastoGlobal}>
                  <input type="hidden" name="id" value={g.id} />
                  <BotonEnviar className="text-xs font-medium text-red-700 hover:underline">Quitar</BotonEnviar>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!piloto && <section className="print:hidden">
        <h2 id="retiros" className="mb-1 scroll-mt-12 font-semibold">Retiros y aportes del mes</h2>
        <p className="mb-2 text-xs text-tinta-suave">
          Retiro: descuenta sueldo y caja. Aporte: aumenta lo que se debe y la caja.
        </p>
        <div className="rounded-2xl bg-crema-claro p-3 shadow-sm">
          <form action={crearRetiro} className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <select
              name="persona"
              defaultValue="isadora"
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
             aria-label="Persona del movimiento">
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
             aria-label="Retiro o aporte">
              <option value="retiro">Retiro (saca)</option>
              <option value="aporte">Aporte (pone)</option>
            </select>
            <input
              type="date"
              name="fecha"
              required
              defaultValue={hoyEnChile()}
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            aria-label="Fecha del movimiento" />
            <input
              name="monto"
              inputMode="numeric"
              placeholder="20.000"
              required
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            aria-label="Monto en pesos" />
            <select
              name="caja"
              defaultValue="efectivo"
              aria-label="¿De qué caja salió?"
              className="rounded-lg border-2 border-brand/40 bg-white px-2 py-1.5 text-sm font-medium outline-none focus:border-brand"
            >
              <option value="efectivo">💵 Del efectivo</option>
              <option value="digital">🏦 De la caja digital</option>
            </select>
            <select
              name="medio_pago"
              defaultValue=""
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
             aria-label="Medio de pago">
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
            aria-label="Motivo del movimiento" />
            <BotonEnviar className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark">Agregar</BotonEnviar>
          </form>
        </div>
        {retiros.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {retiros.map((r) => {
              const operativoNombre = uno(
                r.operativos as unknown as { nombre: string } | { nombre: string }[] | null
              )?.nombre;
              const chequeoNombre = uno(r.chequeos as unknown as { nombre: string } | { nombre: string }[] | null)?.nombre;
              const destinoNombre = chequeoNombre ?? operativoNombre;
              const esAporte = r.monto < 0;
              const etiqueta = esAporte ? "Aporte" : r.es_sueldo ? "Sueldo pagado" : "Retiro";
              const colorEtiqueta = esAporte
                ? "bg-green-100 text-green-900"
                : r.es_sueldo
                  ? "bg-brand text-white"
                  : "bg-amber-100 text-amber-900";
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="text-xs text-tinta-suave">{fechaLegible(r.fecha)}</span>
                  <span className="font-medium">{nombresReparto[r.persona as keyof typeof nombresReparto] ?? r.persona}</span>
                  <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${colorEtiqueta}`}>
                    {etiqueta}
                  </span>
                  <span className="rounded-md bg-crema-claro px-1.5 py-0.5 text-xs font-medium text-tinta-suave">
                    {r.caja === "efectivo" ? "💵" : "🏦"} {CAJAS_LABEL[r.caja] ?? r.caja}
                  </span>
                  <span className="flex-1 text-xs text-tinta-suave">
                    {[r.motivo, destinoNombre ? `contra ${destinoNombre}` : null, r.medio_pago ? MEDIOS_PAGO_LABEL[r.medio_pago] : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  <span className="font-semibold">{clp(Math.abs(r.monto))}</span>
                  {!r.reparto_verificado && !r.es_sueldo && <form action={eliminarRetiro}>
                    <input type="hidden" name="id" value={r.id} />
                    <BotonEnviar className="text-xs font-medium text-red-700 hover:underline">Quitar</BotonEnviar>
                  </form>}
                  {!r.operativo_id && !r.chequeo_id && r.monto !== 0 && <details className="w-full">
                    <summary className="cursor-pointer text-xs font-semibold">Asociar movimiento histórico</summary>
                    <CajaFormulario guardar={asociarRetiroHistorico} texto="Asociar">
                      <input type="hidden" name="id" value={r.id} />
                      <label className="text-sm">Chequeo u operativo
                        <select name="destino" required className="block w-full rounded-lg border px-2 py-1.5">
                          <option value="">Elige el destino</option>
                          {grupos.map(g => <option key={g.id} value={`chequeo:${g.id}`}>{g.nombre} · {fechaLegible(g.desde)}</option>)}
                          {(operativosTodosRes.data ?? []).filter(o => !o.chequeo_id && o.estado !== "cancelado").map(o =>
                            <option key={o.id} value={`operativo:${o.id}`}>{o.nombre} · {fechaLegible(o.fecha)}</option>)}
                        </select>
                      </label>
                    </CajaFormulario>
                  </details>}
                </li>
              );
            })}
          </ul>
        )}
      </section>}
    </div>
  );
}
