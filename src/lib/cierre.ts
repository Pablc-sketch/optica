// Cierre de un operativo: cuánto se ganó de verdad y cuánto hay que pagarle
// a cada uno. Código puro, para probarlo con los números reales.
//
// Utilidad real = lo vendido (lentes + consultas)
//   − cristales (lo que se le paga a Fides)
//   − marcos ($5.000 por par)
//   − gastos del operativo (arriendo, equipos, transporte, ayudante…)
//   − comisión de la máquina de tarjetas.
// Reparto (reglas vigentes, no cambian): Isadora % de lo vendido en lentes,
// ahorro % de lo que queda, resto mitad mamá y mitad Pablo.
import { calcularSueldos, type BaseComision } from "./sueldos";

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
  isadora: number;
  ahorro: number;
  madre: number;
  pablo: number;
};

export function calcularCierre(e: EntradaCierre): Cierre {
  const comisionTarjeta = Math.round((e.cobradoDebito * e.pctDebito + e.cobradoCredito * e.pctCredito) / 100);
  const costos = e.costoCristales + e.costoMarcos + (e.costoOtrosProductos ?? 0) + e.gastosOperativo + comisionTarjeta;
  const utilidad = e.vendido - costos;
  const s = calcularSueldos(e.vendido, utilidad, {
    comisionVendedoraPct: e.comisionVendedoraPct,
    comisionVendedoraBase: e.comisionVendedoraBase,
    ahorroPct: e.ahorroPct,
    ventaSinComision: e.consultas,
  });
  return {
    comisionTarjeta,
    costos,
    utilidad,
    gastoTotal: costos + s.comisionIsadora,
    gananciaLiquida: utilidad - s.comisionIsadora,
    isadora: s.comisionIsadora,
    ahorro: s.ahorro,
    madre: s.parteMadre,
    pablo: s.partePablo,
  };
}
