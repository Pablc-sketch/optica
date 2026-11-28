import { expect, it } from "vitest";
import { desglosarCostos } from "@/lib/costo-venta";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { resumirCajaChequeo } from "@/lib/caja-chequeo";

const ot = (extra: Record<string, unknown>) => ({ costo_laboratorio: 20_000, costo_laboratorio_2: null, ...extra });

it("todas las pantallas: el marco del paciente no se repone y el de Inventario va a su costo", () => {
  const d = desglosarCostos([
    { cantidad: 1, cristal_slot: 1, ordenes_trabajo: ot({ marco_propio: true }) },
    { cantidad: 1, cristal_slot: 1, ordenes_trabajo: ot({ marco_propio: false, marco_1: { costo: 14_000 } }) },
    { cantidad: 1, cristal_slot: 1, ordenes_trabajo: ot({ marco_propio: false, marco_1: { costo: 0 } }) },
    // Consultas antiguas sin esos campos: se mantiene el costo por par.
    { cantidad: 1, cristal_slot: 1, ordenes_trabajo: ot({}) },
  ], 6000);
  expect(d).toMatchObject({ totalCristales: 80_000, marcos: 3, totalArmazones: 14_000 + 6000 + 6000 });
});

it("el costo de otros productos vendidos (lentes de contacto) se repone antes de los sueldos", () => {
  const sede = { id: "a", nombre: "a", fecha: "2026-11-25", fecha_fin: null, estado: "realizado", direccion: null, chequeo_id: "g",
    costo_transporte: 0, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, comision_vendedora_pct: 10,
    comision_vendedora_base: "venta_total", ahorro_pct: 20 } as unknown as SedeChequeo;
  const venta = (costo: number) => [{ operativo_id: "a", total: 50_000, pagos_abonos: [{ monto: 50_000, medio_pago: "efectivo" }],
    venta_items: [{ cantidad: 1, producto_id: "lc", precio_unitario: 50_000, productos: { costo, categoria: "lente_contacto" } }] }] as unknown as VentaChequeo[];
  const calcular = (costo: number) => {
    const n = resumirChequeo([sede], [], venta(costo), 0, 0, 0, 10);
    return { utilidad: n.utilidad, caja: resumirCajaChequeo(n, "g", [], [], [], [], new Set(), { ahorroPct: 20, parteMadrePct: 50 }) };
  };
  const sin = calcular(0);
  const con = calcular(20_000);
  expect(sin.utilidad - con.utilidad).toBe(20_000);
  expect(sin.caja.proyectado - con.caja.proyectado).toBe(20_000);
  expect(con.caja).toMatchObject({ marcos: 20_000, marcosPendientes: 20_000 });
});
