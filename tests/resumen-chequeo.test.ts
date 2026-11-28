import { expect, it } from "vitest";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { resumirCajaChequeo, type GastoChequeo } from "@/lib/caja-chequeo";
import { cuentasDelChequeo } from "@/lib/resumen-chequeo";

// Chequeo ficticio de tres sedes: dos con equipos, una sin ventas.
const sede = (id: string, extra: Partial<SedeChequeo> = {}): SedeChequeo => ({
  id, nombre: id, fecha: "2026-11-26", fecha_fin: null, estado: "realizado", direccion: null, chequeo_id: "c",
  costo_transporte: 0, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, costo_ayudante: 0, costo_equipos: 0,
  costo_hospedaje: 0, costo_comida: 0, costo_peajes: 0,
  comision_vendedora_pct: 10, comision_vendedora_base: "venta_total", ahorro_pct: 20, ...extra,
} as SedeChequeo);
const lente = (op: string, total: number, pagos: { monto: number; medio_pago: string }[], lab: number, marco: number | null) => ({
  operativo_id: op, total, pagos_abonos: pagos,
  venta_items: [{ cantidad: 1, cristal_slot: 1, descripcion: "Lentes", producto_id: null, precio_unitario: total,
    ordenes_trabajo: { estado: "laboratorio", costo_laboratorio: lab, costo_laboratorio_2: null, tipo_lente: "Monofocal", tipo_lente_2: null,
      tratamiento: null, tratamiento_2: null, marco_propio: marco === null, marco_propio_2: false,
      armazon_producto_id: marco === null ? null : "m", armazon_producto_id_2: null, marco_1: marco === null ? null : { costo: marco } } }],
}) as unknown as VentaChequeo;

function armar(gastos: GastoChequeo[], retiros: { persona: string; monto: number }[] = []) { return armarCon(gastos, 0, retiros); }
function armarCon(gastos: GastoChequeo[], gastosEquipos: number, retiros: { persona: string; monto: number }[] = []) {
  const sedes = [sede("Labrador", { costo_equipos: 52_000, costo_transporte: 25_000, costo_comida: 12_000 }),
    sede("El Rosario", { costo_equipos: 52_000 }), sede("Talagante")];
  const ventas = [
    lente("Labrador", 220_000, [{ monto: 220_000, medio_pago: "debito" }], 30_000, 9000),
    lente("Labrador", 90_000, [{ monto: 40_000, medio_pago: "efectivo" }], 25_000, null),
    lente("El Rosario", 160_000, [{ monto: 160_000, medio_pago: "transferencia" }], 18_000, 14_000),
  ];
  const iva = Math.round(470_000 * 19 / 119);
  const n = resumirChequeo(sedes, [], ventas, gastosEquipos, 2, 3, 10, 0, iva);
  const caja = resumirCajaChequeo(n, "c", gastos, [], [], retiros, new Set(), { ahorroPct: 20, parteMadrePct: 50 });
  const datos = { n: { ...n, reparto: caja.reparto }, caja, ventas, sii: { saldo: iva, siguiente: "2026-12-01", venceEl: null },
    ivaSinCredito: true, retirosSinAsignar: false, tenant: null, gastosEquipos } as never;
  const saldos = { efectivo: 40_000, efectivoVerificado: true, saldoConfirmado: null, deudaPersonal: 0, devoluciones: 0,
    cuenta: { estado: "disponible", disponible: 150_000, total: 180_000, consultadoEn: "2026-11-28T15:00:00Z" } } as never;
  return cuentasDelChequeo(datos, saldos, { comision_isadora_pct: 10, ahorro_pct: 20 });
}

it("cobrado, por cobrar y vendido cuadran, y la cuenta muestra lo que Mercado Pago aún no libera", () => {
  const c = armar([]);
  expect(c).toMatchObject({ vendido: 470_000, cobrado: 420_000, porCobrar: 50_000,
    cobradoEfectivo: 40_000, cobradoDigital: 380_000, cuentaDisponible: 150_000, cuentaPorLiberar: 30_000, efectivo: 40_000 });
});

it("vendido − gastos = lo que queda para sueldos y ahorro, sin ajustes escondidos", () => {
  const c = armar([]);
  const montos = Object.fromEntries(c.gastos.filas.map(f => [f.clave, f.monto]));
  // Marcos: $9.000 (Inventario) + $14.000; el del paciente no se repone.
  expect(montos).toMatchObject({ cristales: 73_000, marcos: 23_000, iva: 75_042, viaticos: 37_000, equipos: 104_000, tarjetas: 4400 });
  expect(montos.ajustes).toBeUndefined();
  expect(c.vendido - c.gastos.total).toBe(c.resultado);
  const [isadora, pamela, pablo, ahorro] = c.sueldos.personas.map(p => p.total);
  expect(isadora).toBe(47_000);
  expect(c.perdida).toBe(false);
  expect(isadora + pamela + pablo + ahorro).toBe(c.resultado);
  expect(c.gastos.filas.find(f => f.clave === "equipos")?.nota).toContain("2 sedes con equipo");
  expect(c.gastos.filas.find(f => f.clave === "iva")?.nota).toContain("12 de diciembre");
});

it("una compra de marcos para stock no baja los sueldos", () => {
  const stock: GastoChequeo = { id: "s", fecha: "2026-11-27", descripcion: "Marcos Polo", monto: 380_000, caja: "digital",
    categoria: "compra_inventario", operativo_id: null, chequeo_id: "c", nota: null, monto_estimado: false };
  const sin = armar([]);
  const con = armar([stock]);
  expect(con.compraStock).toBe(380_000 - 23_000);
  expect(con.sueldos.total).toBe(sin.sueldos.total);
  expect(con.vendido - con.gastos.total).toBe(con.resultado);
});

it("un retiro mayor a lo que tocaba se avisa y no cambia el total", () => {
  const sin = armar([]);
  const c = armar([], [{ persona: "madre", monto: 200_000 }]);
  expect(c.resultado).toBe(sin.resultado);
  expect(c.sueldos.personas.find(p => p.persona === "madre")?.nota).toContain("de más");
  expect(c.vendido - c.gastos.total).toBe(c.resultado);
});

it("el arriendo de equipos registrado para todo el chequeo va a Equipos, no a Viáticos", () => {
  const equipos: GastoChequeo = { id: "e", fecha: "2026-11-28", descripcion: "Arriendo de equipos · 5 días", monto: 260_000,
    caja: "digital", categoria: "arriendo", operativo_id: null, chequeo_id: "c", nota: null, monto_estimado: false };
  const sin = armar([]);
  const con = armarCon([equipos], 260_000);
  const fila = (c: typeof sin, clave: string) => c.gastos.filas.find(f => f.clave === clave)?.monto;
  expect(fila(con, "equipos")).toBe((fila(sin, "equipos") ?? 0) + 260_000);
  expect(fila(con, "viaticos")).toBe(fila(sin, "viaticos"));
  expect(con.resultado).toBe(sin.resultado - 260_000);
  expect(con.vendido - con.gastos.total).toBe(con.resultado);
});
