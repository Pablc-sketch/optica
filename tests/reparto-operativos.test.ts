import { describe, expect, it } from "vitest";
import { resumirCajaChequeo, type GastoChequeo } from "@/lib/caja-chequeo";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { cierrePorConfirmar, repartoPorOperativo } from "@/lib/reparto-operativos";
import { PERSONAS_REPARTO, type RetiroReparto } from "@/lib/reparto";

const sede = (id: string, costo_transporte: number): SedeChequeo => ({
  id, nombre: id, fecha: "2026-11-26", fecha_fin: null, direccion: null, estado: "realizado",
  chequeo_id: "grupo", costo_transporte, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0,
  ahorro_pct: 20, comision_vendedora_pct: 10, comision_vendedora_base: "venta_total",
});
const venta = (operativo_id: string, total: number, costo_laboratorio: number, marco_propio: boolean, pagado = total): VentaChequeo => ({
  operativo_id, total, pagos_abonos: [{ monto: pagado, medio_pago: "efectivo" }],
  venta_items: [{ cantidad: 1, producto_id: null, precio_unitario: total,
    ordenes_trabajo: { costo_laboratorio, costo_laboratorio_2: null, marco_propio, marco_propio_2: false,
      armazon_producto_id: null, armazon_producto_id_2: null } }],
});
const gasto = (id: string, monto: number, operativo_id: string | null): GastoChequeo => ({
  id, monto, operativo_id, chequeo_id: operativo_id ? null : "grupo", fecha: "2026-11-26",
  descripcion: "Almuerzo", caja: "digital", categoria: "otro", nota: null, monto_estimado: false,
});

function calcular(retiros: RetiroReparto[] = [], cobradoA = 120_000) {
  const n = resumirChequeo([sede("a", 15_000), sede("b", 10_000)], [], [
    venta("a", 120_000, 25_000, false, cobradoA),
    venta("b", 80_000, 15_000, true),
  ], 15_000, 0, 0, 10, 0, 15_000);
  const caja = resumirCajaChequeo(n, "grupo", [gasto("directo", 5000, "a"), gasto("comun", 10_000, null)],
    [], [], retiros, new Set(), { ahorroPct: 20, parteMadrePct: 50 });
  return { caja, filas: repartoPorOperativo(n, caja, retiros, new Map([["a", 5000]])) };
}

describe("Sueldos por operativo", () => {
  it("descuenta los gastos de cada sede y distribuye los compartidos una sola vez", () => {
    const { caja, filas: [a, b] } = calcular();
    expect(a).toMatchObject({ utilidad: 43_000, gastos: 20_000, gastosComunes: 6000,
      pendiente: { isadora: 12_000, madre: 17_200, pablo: 17_200, ahorro: 8600 } });
    expect(b).toMatchObject({ utilidad: 37_000, gastos: 10_000, gastosComunes: 4000,
      pendiente: { isadora: 8000, madre: 14_800, pablo: 14_800, ahorro: 7400 } });
    expect(caja.repartoPendiente).toEqual({ isadora: 20_000, madre: 32_000, pablo: 32_000, ahorro: 16_000 });
  });

  it("distingue pagos por sede y pagos globales sin repetir importes ni habilitar cierres con saldos", () => {
    const grupal = { persona: "madre", monto: 4000, fecha: "2026-11-26" };
    const inicial = calcular([grupal]).filas[0];
    expect(inicial.pagado.madre).toBe(2150);
    expect(cierrePorConfirmar(inicial)).toMatch(/sueldos pendientes/);
    const pagos = PERSONAS_REPARTO.filter(p => p !== "ahorro")
      .map(persona => ({ persona, monto: inicial.pendiente[persona], operativo_id: "a", fecha: "2026-11-27" }));
    const retiros = [...pagos, grupal];
    const { caja, filas } = calcular(retiros);
    expect(cierrePorConfirmar(filas[0])).toBeNull();
    expect(cierrePorConfirmar(calcular(retiros, 100_000).filas[0])).toMatch(/por cobrar/);
    for (const persona of PERSONAS_REPARTO) {
      expect(filas.reduce((s, f) => s + f.pendiente[persona], 0)).toBe(caja.repartoPendiente[persona]);
    }
  });

  it("conserva el ahorro como remanente cuando se pagan los tres sueldos", () => {
    const { caja: inicial } = calcular();
    const retiros = PERSONAS_REPARTO.filter(p => p !== "ahorro")
      .map(persona => ({ persona, monto: inicial.repartoPendiente[persona] }));
    const { caja, filas } = calcular(retiros);
    expect(filas.every(f => cierrePorConfirmar(f) === null)).toBe(true);
    expect(caja.saldoTrasPagos).toBe(16_000);
    expect(caja.repartoPendiente).toEqual({ isadora: 0, madre: 0, pablo: 0, ahorro: 16_000 });
  });
});
