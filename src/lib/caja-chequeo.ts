import { calcularReparto, retirosPorPersona, type ReglasReparto, type RetiroReparto } from "./reparto";
import type { resumirChequeo } from "./chequeos";
import { COSTOS, costosDeSede, disponibleDeGasto, esPagoDeCosto, pagosConAsignaciones, type AsignacionCosto } from "./pagos-operativo";

export type GastoChequeo = {
  id: string; fecha: string; descripcion: string; monto: number; caja: string;
  categoria: string; operativo_id: string | null; chequeo_id: string | null;
  nota: string | null; monto_estimado: boolean;
};
type Devolucion = { gasto_id: string | null; monto: number };
type Resumen = ReturnType<typeof resumirChequeo>;

export function gastoDeResultado(gasto: GastoChequeo, asignaciones: AsignacionCosto[]) {
  return gasto.categoria === "compra_inventario" ? 0 : disponibleDeGasto(gasto, asignaciones);
}

export function resumirCajaChequeo(
  resumen: Resumen, chequeoId: string, gastos: GastoChequeo[], asignaciones: AsignacionCosto[],
  devoluciones: Devolucion[], retiros: RetiroReparto[], gastosSii: ReadonlySet<string>,
  reglas: ReglasReparto,
) {
  const sedes = new Set(resumen.filas.map(f => f.sede.id));
  const costosPorSede = resumen.filas.map(f => {
    const pagos = gastos.filter(g => g.operativo_id === f.sede.id);
    // Marcos y otros productos vendidos (lentes de contacto, accesorios) se
    // reponen igual: los dos entran en la reserva de reposición.
    const costos = costosDeSede(f.sede, { totalCristales: f.desglose.totalCristales,
      totalArmazones: f.desglose.totalArmazones + f.desglose.totalOtros }, pagosConAsignaciones(pagos, asignaciones, f.sede.id));
    return { sede: f.sede, costos: f.sede.pagos_saldados_en ? costos.map(c => ({ ...c, pagado: Math.max(c.total, c.pagado) })) : costos };
  });
  const costos = costosPorSede.flatMap(f => f.costos);
  const montoCostos = (clave: string) => costos.filter(c => c.clave === clave).reduce((total, c) => total + c.total, 0);
  const saldoCosto = (clave: string) => costos.filter(c => c.clave === clave)
    .reduce((total, c) => total + Math.max(0, c.total - c.pagado), 0);
  const fidesPendiente = saldoCosto("fides");
  const reservaMarcosInicial = saldoCosto("marcos");
  let reposicionMarcos = 0;
  let gastosPagados = 0;
  let reintegrosPagados = 0;
  let porReembolsar = 0;
  let comidaCompartida = 0;
  let pagosSiiEnCaja = 0;
  const adelantos = [];
  const pagados = [];
  for (const gasto of gastos) {
    const propia = gasto.chequeo_id === chequeoId || (gasto.operativo_id !== null && sedes.has(gasto.operativo_id));
    const repartos = asignaciones.filter(a => a.gasto_id === gasto.id && !a.anulado_en);
    const asignado = repartos.filter(a => sedes.has(a.operativo_id)).reduce((total, a) => total + a.monto, 0);
    const asignadoTotal = repartos.reduce((total, a) => total + a.monto, 0);
    const libre = propia ? Math.max(0, gasto.monto - asignadoTotal) : 0;
    const importe = asignado + libre;
    if (importe <= 0) continue;
    // Toda compra de stock del chequeo (marcos, inventario) repone primero los
    // marcos vendidos. El resto es stock para próximos chequeos: sale de la
    // caja, pero no se descuenta de los sueldos de este chequeo.
    if (gasto.categoria === "compra_inventario" && !gasto.monto_estimado && !esPagoDeCosto(gasto.descripcion)) reposicionMarcos += libre;
    if (gasto.chequeo_id === chequeoId && /^Comida · /i.test(gasto.descripcion)) comidaCompartida += libre;
    if (gasto.caja === "personal") {
      const devuelto = devoluciones.filter(d => d.gasto_id === gasto.id).reduce((total, d) => total + d.monto, 0);
      const reintegro = Math.min(importe, Math.round(devuelto * importe / gasto.monto));
      const saldo = importe - reintegro;
      reintegrosPagados += reintegro;
      if (gastosSii.has(gasto.id)) pagosSiiEnCaja += reintegro;
      porReembolsar += saldo;
      if (saldo > 0) adelantos.push({ gasto, saldo, saldoReal: Math.max(0, gasto.monto - devuelto) });
    } else {
      gastosPagados += importe;
      if (gastosSii.has(gasto.id)) pagosSiiEnCaja += importe;
      pagados.push({ gasto, importe });
    }
  }
  const otrosPendientes = COSTOS.map(({ clave, titulo }) => ({
    etiqueta: titulo,
    valor: saldoCosto(clave),
  })).filter(c => c.valor > 0);
  const terrenoPendiente = otrosPendientes.reduce((total, c) => total + c.valor, 0);
  const salidas = gastosPagados + reintegrosPagados;
  const retirosNetos = retiros.reduce((total, r) => total + r.monto, 0);
  const comisionTarjeta = resumen.filas.reduce((total, f) => total + f.comisionTarjeta, 0);
  const retirado = retirosPorPersona(retiros);
  const comisionPendiente = Math.max(0, resumen.comisionVentas - retirado.isadora);
  const cajaRegistrada = resumen.cobrado - comisionTarjeta - salidas - retirosNetos;
  const ivaPendienteCaja = Math.max(0, resumen.iva - pagosSiiEnCaja);
  const coberturaMarcos = Math.min(reservaMarcosInicial, reposicionMarcos);
  const marcosPendientes = reservaMarcosInicial - coberturaMarcos;
  const compraStock = reposicionMarcos - coberturaMarcos;
  const saldoTrasPagos = cajaRegistrada - fidesPendiente - marcosPendientes - terrenoPendiente
    - porReembolsar - comisionPendiente - ivaPendienteCaja + compraStock;
  const reparto = calcularReparto(saldoTrasPagos, resumen.porCobrar, comisionPendiente, retirado, reglas);
  return {
    ...reparto, costosPorSede, reposicionMarcos, coberturaMarcos, compraStock,
    cristales: montoCostos("fides"), marcos: montoCostos("marcos"), comida: montoCostos("costo_comida") + comidaCompartida,
    fidesPendiente, marcosPendientes, ivaPendienteCaja, terrenoPendiente, otrosPendientes, salidas, gastosPagados, reintegrosPagados, retirosNetos,
    comisionTarjeta, comisionPendiente, porReembolsar, adelantos, pagados, cajaRegistrada, saldoTrasPagos,
  };
}
