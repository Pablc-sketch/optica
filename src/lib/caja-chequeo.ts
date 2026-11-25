import type { resumirChequeo } from "./chequeos";
import { costosDeSede, disponibleDeGasto, pagosConAsignaciones, type AsignacionCosto } from "./pagos-operativo";

export type GastoChequeo = {
  id: string; fecha: string; descripcion: string; monto: number; caja: string;
  categoria: string; operativo_id: string | null; chequeo_id: string | null;
  nota: string | null; monto_estimado: boolean;
};
type Devolucion = { gasto_id: string | null; monto: number };
type Retiro = { persona: string; monto: number };
type Resumen = ReturnType<typeof resumirChequeo>;

export function gastoDeResultado(gasto: GastoChequeo, asignaciones: AsignacionCosto[]) {
  return gasto.categoria === "compra_inventario" ? 0 : disponibleDeGasto(gasto, asignaciones);
}

export function resumirCajaChequeo(
  resumen: Resumen, chequeoId: string, gastos: GastoChequeo[], asignaciones: AsignacionCosto[],
  devoluciones: Devolucion[], retiros: Retiro[],
) {
  const sedes = new Set(resumen.filas.map(f => f.sede.id));
  const costos = resumen.filas.flatMap(f => {
    const pagos = gastos.filter(g => g.operativo_id === f.sede.id);
    return costosDeSede(f.sede, f.desglose, pagosConAsignaciones(pagos, asignaciones, f.sede.id));
  });
  const montoCostos = (clave: string) => costos.filter(c => c.clave === clave).reduce((total, c) => total + c.total, 0);
  const fidesPendiente = costos.filter(c => c.clave === "fides").reduce((total, c) => total + Math.max(0, c.total - c.pagado), 0);
  let salidas = 0;
  let porReembolsar = 0;
  let comidaCompartida = 0;
  const adelantos = [];
  for (const gasto of gastos) {
    const propia = gasto.chequeo_id === chequeoId || (gasto.operativo_id !== null && sedes.has(gasto.operativo_id));
    const repartos = asignaciones.filter(a => a.gasto_id === gasto.id && !a.anulado_en);
    const asignado = repartos.filter(a => sedes.has(a.operativo_id)).reduce((total, a) => total + a.monto, 0);
    const asignadoTotal = repartos.reduce((total, a) => total + a.monto, 0);
    const libre = propia ? Math.max(0, gasto.monto - asignadoTotal) : 0;
    const importe = asignado + libre;
    if (importe <= 0) continue;
    if (gasto.chequeo_id === chequeoId && /^Comida · /i.test(gasto.descripcion)) comidaCompartida += libre;
    if (gasto.caja === "personal") {
      const devuelto = devoluciones.filter(d => d.gasto_id === gasto.id).reduce((total, d) => total + d.monto, 0);
      const reintegro = Math.min(importe, Math.round(devuelto * importe / gasto.monto));
      const saldo = importe - reintegro;
      salidas += reintegro;
      porReembolsar += saldo;
      if (saldo > 0) adelantos.push({ gasto, saldo });
    } else {
      salidas += importe;
    }
  }
  const terrenoPendiente = costos.filter(c => c.clave !== "fides" && c.clave !== "marcos")
    .reduce((total, c) => total + Math.max(0, c.total - c.pagado), 0);
  const comisionTarjeta = resumen.filas.reduce((total, f) => total + f.comisionTarjeta, 0);
  const yaRetirado = (persona: string) => retiros.filter(r => r.persona === persona).reduce((total, r) => total + r.monto, 0);
  const comisionPendiente = Math.max(0, resumen.comisionVentas - yaRetirado("isadora"));
  const cajaRegistrada = resumen.cobrado - comisionTarjeta - salidas - retiros.reduce((total, r) => total + r.monto, 0);
  const saldoTrasPagos = cajaRegistrada - fidesPendiente - terrenoPendiente - porReembolsar - comisionPendiente;
  return {
    cristales: montoCostos("fides"), marcos: montoCostos("marcos"), comida: montoCostos("costo_comida") + comidaCompartida,
    fidesPendiente, terrenoPendiente, salidas, comisionTarjeta, comisionPendiente, porReembolsar, adelantos, cajaRegistrada, saldoTrasPagos,
    proyectado: saldoTrasPagos + resumen.porCobrar,
    repartoPendiente: {
      madre: Math.max(0, resumen.reparto.parteMadre - yaRetirado("madre")),
      pablo: Math.max(0, resumen.reparto.partePablo - yaRetirado("pablo")),
      ahorro: Math.max(0, resumen.reparto.ahorro - yaRetirado("ahorro")),
    },
  };
}
