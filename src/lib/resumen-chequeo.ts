import { clp } from "./clp";
import { disponibleDelReparto } from "./datos-reparto-disponible";
import type { cargarCajaChequeo } from "./datos-caja-chequeo";
import type { saldosReparto } from "./datos-reparto-disponible";
import type { Chequeo } from "./chequeos";

// Los números del resumen simple del chequeo, sacados del mismo cálculo del
// reparto (caja-chequeo.ts). Regla: vendido − gastos = lo que queda para
// sueldos y ahorro, siempre. Si algo no calza (un pago de más, un retiro
// mayor a lo que tocaba), aparece como "Otros ajustes" en vez de esconderse.

type Datos = NonNullable<Awaited<ReturnType<typeof cargarCajaChequeo>>>;
type Saldos = Awaited<ReturnType<typeof saldosReparto>>;
type ClaveGasto = "cristales" | "marcos" | "iva" | "viaticos" | "equipos" | "tarjetas" | "ajustes";

const VIATICOS = [
  ["costo_transporte", "Bencina y transporte"],
  ["costo_comida", "Comida"],
  ["costo_hospedaje", "Hospedaje"],
  ["costo_peajes", "Peajes"],
  ["costo_viaticos", "Viáticos"],
  ["costo_arriendo", "Salón"],
  ["costo_ayudante", "Ayudante"],
  ["costo_otros", "Otros"],
] as const;

const mesLargo = (fecha: string) => new Intl.DateTimeFormat("es-CL", { month: "long", timeZone: "UTC" }).format(new Date(fecha));

export function cuentasDelChequeo(datos: Datos, saldos: Saldos, chequeo?: Pick<Chequeo, "comision_isadora_pct" | "ahorro_pct">) {
  const { n, caja, sii } = datos;
  const costos = caja.costosPorSede.flatMap(f => f.costos);
  const total = (clave: string) => costos.filter(c => c.clave === clave).reduce((s, c) => s + c.total, 0);
  const pendiente = (clave: string) => costos.filter(c => c.clave === clave).reduce((s, c) => s + Math.max(0, c.total - c.pagado), 0);

  let cobradoEfectivo = 0;
  for (const venta of datos.ventas) for (const pago of venta.pagos_abonos ?? []) {
    if (pago.medio_pago === null || pago.medio_pago === "efectivo") cobradoEfectivo += pago.monto;
  }

  const partesViaticos: { titulo: string; monto: number }[] = VIATICOS.map(([clave, titulo]) => ({ titulo, monto: total(clave) }));
  if (n.gastosCompartidos) partesViaticos.push({ titulo: "Gastos del chequeo", monto: n.gastosCompartidos });
  const viaticos = partesViaticos.reduce((s, p) => s + p.monto, 0);
  const equipos = total("costo_equipos");
  const diasEquipos = caja.costosPorSede.filter(f => f.costos.some(c => c.clave === "costo_equipos" && c.total > 0)).length;
  const mesIva = sii?.siguiente ? mesLargo(sii.siguiente) : null;
  const diaIva = sii?.venceEl ? Number(sii.venceEl.slice(8, 10)) : 12;

  const filas: { clave: ClaveGasto; titulo: string; monto: number; nota: string }[] = [
    { clave: "cristales", titulo: "Cristales", monto: caja.cristales,
      nota: `Laboratorio · ${n.pares} ${n.pares === 1 ? "par" : "pares"}${caja.fidesPendiente ? ` · falta pagar ${clp(caja.fidesPendiente)}` : " · pagado"}` },
    { clave: "marcos", titulo: "Marcos", monto: caja.marcos,
      nota: `Reponer ${n.marcos} ${n.marcos === 1 ? "marco vendido" : "marcos vendidos"}, a su costo de Inventario`
        + (caja.marcosPendientes ? ` · falta reponer ${clp(caja.marcosPendientes)}` : caja.marcos ? " · ya repuesto" : "") },
    { clave: "iva", titulo: "IVA", monto: n.iva,
      nota: `${mesIva ? `Se paga el ${diaIva} de ${mesIva}` : "Se paga el mes siguiente"} · guardarlo${datos.ivaSinCredito ? " · estimado sin crédito fiscal" : ""}` },
    { clave: "viaticos", titulo: "Viáticos", monto: viaticos,
      nota: partesViaticos.filter(p => p.monto).map(p => `${p.titulo} ${clp(p.monto)}`).join(" · ") || "Sin viáticos cargados" },
    { clave: "equipos", titulo: "Arriendo de equipos", monto: equipos,
      nota: equipos ? `${diasEquipos} ${diasEquipos === 1 ? "día" : "días"} con equipo${pendiente("costo_equipos") ? ` · falta pagar ${clp(pendiente("costo_equipos"))}` : ""}`
        : "Sin cargar: anótalo en cada sede" },
    { clave: "tarjetas", titulo: "Comisión de tarjetas", monto: caja.comisionTarjeta, nota: "Lo que cobra Mercado Pago por débito y crédito" },
  ];

  // Lo que queda para sueldos según el cálculo del reparto.
  const resultado = n.comisionVentas + caja.reparto.utilidadNeta;
  const ajuste = n.vendido - filas.reduce((s, f) => s + f.monto, 0) - resultado;
  if (ajuste !== 0) filas.push({ clave: "ajustes", titulo: "Otros ajustes", monto: ajuste,
    nota: "Pagos de más, reintegros o retiros por sobre lo que tocaba. Revisa el detalle de Caja." });
  const gastosTotal = filas.reduce((s, f) => s + f.monto, 0);
  const porPagar = caja.fidesPendiente + caja.marcosPendientes + caja.ivaPendienteCaja + caja.terrenoPendiente;

  const pct = Number(chequeo?.comision_isadora_pct ?? 10);
  const ahorroPct = Number(chequeo?.ahorro_pct ?? 0);
  const ya = (persona: "isadora" | "ahorro" | "madre" | "pablo") => caja.retirado[persona];
  const nota = (recibido: number, falta: number, total?: number) => total !== undefined && recibido > total
    ? `Ya recibió ${clp(recibido)}: ${clp(recibido - total)} de más, se descuenta a los demás`
    : `Ya recibió ${clp(recibido)} · falta ${clp(falta)}`;
  const personas = [
    { persona: "isadora" as const, total: n.comisionVentas, nota: `${pct}% de lo vendido, sin consultas · ${nota(ya("isadora"), caja.comisionPendiente)}` },
    { persona: "madre" as const, total: caja.reparto.parteMadre, nota: nota(ya("madre"), caja.repartoPendiente.madre, caja.reparto.parteMadre) },
    { persona: "pablo" as const, total: caja.reparto.partePablo, nota: nota(ya("pablo"), caja.repartoPendiente.pablo, caja.reparto.partePablo) },
    { persona: "ahorro" as const, total: caja.reparto.ahorro,
      nota: `${ahorroPct}% para marcos, equipos y empezar el próximo chequeo · apartado ${clp(ya("ahorro"))}` },
  ];

  const pagable = disponibleDelReparto(datos, saldos);
  const cuenta = saldos.cuenta;
  const cuentaDisponible = cuenta.estado === "disponible" ? cuenta.disponible
    : saldos.saldoConfirmado ?? (cuenta.estado === "reporte" ? cuenta.disponible : null);

  return {
    vendido: n.vendido, cobrado: n.cobrado, porCobrar: n.porCobrar, conSaldo: n.conSaldo,
    cobradoEfectivo, cobradoDigital: n.cobrado - cobradoEfectivo,
    cuentaDisponible, cuentaPorLiberar: cuenta.estado === "disponible" ? Math.max(0, cuenta.total - cuenta.disponible) : 0,
    efectivo: saldos.efectivo,
    gastos: { filas, total: gastosTotal, porPagar },
    compraStock: caja.compraStock,
    resultado,
    // Con pérdida los socios y el ahorro quedan en $0; la comisión de ventas se paga igual.
    perdida: caja.reparto.utilidadNeta < 0,
    sueldos: { personas, total: personas.reduce((s, p) => s + p.total, 0) },
    hoyPagable: pagable && pagable.isadora + pagable.madre + pagable.pablo + pagable.ahorro,
  };
}
