// Los números de un operativo (vendido, cobrado, costos y reparto), en un
// solo lugar para la pantalla de reparto y para el resumen del Inicio.
import { calcularCierre, type Cierre } from "./cierre";
import { totalConsultas } from "./consulta";
import { desglosarCostos, type ItemConCosto } from "./costo-venta";
import { gastosDeOperativo, type GastosOperativo } from "./gastos-operativo";
import type { BaseComision } from "./sueldos";

export type OperativoParaCierre = GastosOperativo & {
  comision_vendedora_pct: number | string;
  comision_vendedora_base: string;
  ahorro_pct: number | string;
};

export type VentaParaCierre = {
  total: number;
  pagos_abonos?: { monto: number; medio_pago: string | null }[] | null;
  venta_items?: unknown[] | null;
};

export type NumerosOperativo = {
  vendido: number;
  cobrado: number;
  porCobrar: number;
  gastos: number;
  desglose: ReturnType<typeof desglosarCostos>;
  cierre: Cierre;
};

export function numerosDeOperativo(
  op: OperativoParaCierre,
  ventas: VentaParaCierre[],
  pctDebito: number,
  pctCredito: number
): NumerosOperativo {
  const items = ventas.flatMap((v) => v.venta_items ?? []) as unknown as ItemConCosto[];
  const desglose = desglosarCostos(items);
  const pagos = ventas.flatMap((v) => v.pagos_abonos ?? []);
  const suma = (f: (p: { monto: number; medio_pago: string | null }) => boolean) =>
    pagos.filter(f).reduce((s, p) => s + p.monto, 0);
  const vendido = ventas.reduce((s, v) => s + v.total, 0);
  const cobrado = suma(() => true);
  const gastos = gastosDeOperativo(op);
  const cierre = calcularCierre({
    vendido,
    consultas: totalConsultas(items as unknown as Parameters<typeof totalConsultas>[0]),
    costoCristales: desglose.totalCristales,
    costoMarcos: desglose.totalArmazones,
    costoOtrosProductos: desglose.totalOtros,
    gastosOperativo: gastos,
    cobradoDebito: suma((p) => p.medio_pago === "debito"),
    cobradoCredito: suma((p) => p.medio_pago === "credito"),
    pctDebito,
    pctCredito,
    comisionVendedoraPct: Number(op.comision_vendedora_pct),
    comisionVendedoraBase: op.comision_vendedora_base as BaseComision,
    ahorroPct: Number(op.ahorro_pct),
  });
  return { vendido, cobrado, porCobrar: Math.max(0, vendido - cobrado), gastos, desglose, cierre };
}
