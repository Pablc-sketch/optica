// Cierre de un operativo: cuánto se ganó de verdad y cuánto hay que pagarle
// a cada uno. Código puro, para probarlo con los números reales.
//
// Utilidad real = lo vendido (lentes + consultas)
//   − cristales (lo que se le paga a Fides)
//   − marcos ($5.000 por par)
//   − gastos del operativo (arriendo, equipos, transporte, ayudante…)
//   − comisión de la máquina de tarjetas.
// Reparto: el que configure cada óptica (vendedora %, ahorro %, socios).
// Sin reparto configurado no se calcula comisión, ahorro ni partes.
import { repartirUtilidad, type BaseComision } from "./sueldos";
import type { Reparto } from "./configuracion-optica";

export type EntradaCierre = {
  vendido: number;
  consultas: number;
  costoCristales: number;
  costoMarcos: number;
  costoOtrosProductos?: number;
  gastosOperativo: number;
  cobradoDebito: number;
  cobradoCredito: number;
  pctDebito: number;
  pctCredito: number;
  comisionVendedoraPct: number;
  comisionVendedoraBase: BaseComision;
  ahorroPct: number;
};

export type Cierre = {
  comisionTarjeta: number;
  costos: number;
  utilidad: number;
  gastoTotal: number;
  gananciaLiquida: number;
  comisionVendedora: number;
  ahorro: number;
  // Lo que le corresponde a cada persona del reparto (vendedora, socios y
  // ahorro), por su clave. Vacío si la óptica no reparte.
  montos: Record<string, number>;
};

export function calcularCierre(e: EntradaCierre, reparto: Reparto | null): Cierre {
  const comisionTarjeta = Math.round((e.cobradoDebito * e.pctDebito + e.cobradoCredito * e.pctCredito) / 100);
  const costos = e.costoCristales + e.costoMarcos + (e.costoOtrosProductos ?? 0) + e.gastosOperativo + comisionTarjeta;
  const utilidad = e.vendido - costos;
  const s = repartirUtilidad(
    e.vendido,
    utilidad,
    {
      comisionVendedoraPct: reparto ? e.comisionVendedoraPct : 0,
      comisionVendedoraBase: e.comisionVendedoraBase,
      ahorroPct: reparto ? e.ahorroPct : 0,
      ventaSinComision: e.consultas,
    },
    reparto?.socios ?? []
  );
  const montos: Record<string, number> = {};
  if (reparto) {
    montos[reparto.vendedora.clave] = s.comisionVendedora;
    for (const p of s.partes) montos[p.clave] = p.monto;
    montos[reparto.ahorro.clave] = s.ahorro;
  }
  return {
    comisionTarjeta,
    costos,
    utilidad,
    gastoTotal: costos + s.comisionVendedora,
    gananciaLiquida: utilidad - s.comisionVendedora,
    comisionVendedora: s.comisionVendedora,
    ahorro: s.ahorro,
    montos,
  };
}
