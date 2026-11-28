import { gastosDeOperativo } from "./gastos-operativo";
import { PERSONAS_REPARTO, type MontosReparto, type RetiroReparto } from "./reparto";
import type { resumirChequeo } from "./chequeos";
import type { resumirCajaChequeo } from "./caja-chequeo";

export const PERSONAS_SUELDO = ["isadora", "madre", "pablo"] as const;

type Resumen = ReturnType<typeof resumirChequeo>;
type Caja = ReturnType<typeof resumirCajaChequeo>;

// Redondea sobre el acumulado para que la suma conserve cada peso del total.
function prorratear(monto: number, pesos: number[]) {
  const total = pesos.reduce((a, b) => a + b, 0);
  let acumulado = 0;
  return pesos.map(peso => {
    if (!total) return 0;
    const anterior = Math.round(monto * acumulado / total);
    acumulado += peso;
    return Math.round(monto * acumulado / total) - anterior;
  });
}

export function repartoPorOperativo(
  n: Resumen, caja: Caja, retiros: RetiroReparto[], gastosDirectos: ReadonlyMap<string, number>,
) {
  const ventas = n.filas.map(f => Math.max(0, f.vendido));
  const pesosComunes = ventas.some(Boolean) ? ventas : ventas.map(() => 1);
  const totalDirecto = [...gastosDirectos.values()].reduce((a, b) => a + b, 0);
  const gastosComunes = prorratear(n.gastosCompartidos - totalDirecto, pesosComunes);
  const iva = prorratear(n.iva, pesosComunes);
  const filas = n.filas.map((f, i) => {
    const extras = gastosDirectos.get(f.sede.id) ?? 0;
    const gastos = gastosDeOperativo(f.sede) + extras;
    return { ...f, gastos, gastosComunes: gastosComunes[i], iva: iva[i],
      utilidad: f.utilidad - extras - gastosComunes[i] - iva[i] };
  });
  const pesosUtilidad = filas.map(f => Math.max(0, f.utilidad));
  const pesosSocios = pesosUtilidad.some(Boolean) ? pesosUtilidad : pesosComunes;

  const indices = new Map(filas.map((f, i) => [f.sede.id, i]));
  const movimientos = retiros.toSorted((a, b) =>
    (a.fecha ?? "").localeCompare(b.fecha ?? "") ||
    (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
    (a.id ?? "").localeCompare(b.id ?? ""));

  const datos = PERSONAS_REPARTO.map(persona => {
    const estimado = persona === "isadora" ? n.comisionVentas
      : persona === "madre" ? caja.reparto.parteMadre
        : persona === "pablo" ? caja.reparto.partePablo : caja.reparto.ahorro;
    const partes = persona === "isadora" ? filas.map(f => f.comisionVentas) : prorratear(estimado, pesosSocios);
    const pagados = filas.map(() => 0);
    for (const retiro of movimientos) {
      if (retiro.persona !== persona) continue;
      const indice = retiro.operativo_id && indices.get(retiro.operativo_id);
      if (typeof indice === "number") {
        pagados[indice] += retiro.monto;
        continue;
      }
      // Un pago por sede posterior no debe mover un pago global anterior
      // hacia otra sede y volver a abrir un sueldo recién saldado.
      const pesosGrupal = partes.map((p, i) => Math.max(0, p - pagados[i]));
      const asignados = prorratear(retiro.monto, pesosGrupal.some(Boolean) ? pesosGrupal : pesosComunes);
      asignados.forEach((importe, i) => { pagados[i] += importe; });
    }
    const posibles = partes.map((p, i) => Math.max(0, p - pagados[i]));
    const pendientes = prorratear(caja.repartoPendiente[persona], posibles.some(Boolean) ? posibles : pesosComunes);
    return { persona, pagados, pendientes };
  });

  return filas.map((f, i) => ({
    ...f,
    pagado: Object.fromEntries(datos.map(d => [d.persona, d.pagados[i]])) as MontosReparto,
    pendiente: Object.fromEntries(datos.map(d => [d.persona, d.pendientes[i]])) as MontosReparto,
  }));
}

export type RepartoOperativo = ReturnType<typeof repartoPorOperativo>[number];

export function cierrePorConfirmar(sede: RepartoOperativo) {
  if (sede.porCobrar > 0) return "Todavía hay ventas por cobrar en este operativo.";
  if (PERSONAS_SUELDO.some(persona => sede.pendiente[persona] > 0)) return "Registra los sueldos pendientes del operativo.";
  return null;
}
