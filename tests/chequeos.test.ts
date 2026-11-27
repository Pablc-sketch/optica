import { describe, expect, it } from "vitest";
import { gastoDeResultado, resumirCajaChequeo, type GastoChequeo } from "@/lib/caja-chequeo";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";

const reglas = { ahorroPct: 20, parteMadrePct: 50 };

const sede = (id: string): SedeChequeo => ({
  id, nombre: id, fecha: "2026-11-25", fecha_fin: null, estado: "planificado",
  direccion: null, chequeo_id: "grupo", costo_transporte: 0, costo_arriendo: 0,
  costo_viaticos: 0, costo_otros: 0, comision_vendedora_pct: 10,
  comision_vendedora_base: "venta_total", ahorro_pct: 20,
});
const venta = (id: string, total: number, pagado: number): VentaChequeo => ({
  operativo_id: id, total, pagos_abonos: [{ monto: pagado, medio_pago: "efectivo" }],
});
const armazon = {
  producto_id: "marco", cantidad: 1, precio_unitario: 0, productos: { costo: 1000, categoria: "armazon" },
};

describe("Resumen de chequeos", () => {
  it("suma los saldos de cada venta sin descontar un excedente de otra", () => {
    const resumen = resumirChequeo([sede("a"), sede("b")], [
      { operativo_id: "a", paciente_id: "p1" },
      { operativo_id: "b", paciente_id: "p1" },
      { operativo_id: "b", paciente_id: "p2" },
      { operativo_id: "fuera", paciente_id: "p3" },
    ], [venta("a", 50_000, 60_000), venta("b", 30_000, 15_000)], 5000, 0, 0);
    expect(resumen).toMatchObject({
      pacientes: 2, ventas: 2, vendido: 80_000, cobrado: 75_000, porCobrar: 15_000,
      utilidad: 67_000, gastosCompartidos: 5000, comisionVentas: 8000,
    });
  });

  it("distingue marcos propios y sueltos y evita contar dos veces el marco del inventario", () => {
    const ot = {
      costo_laboratorio: 6000, costo_laboratorio_2: 7000, marco_propio: false, marco_propio_2: true,
      armazon_producto_id: "marco", armazon_producto_id_2: null,
    };
    const resumen = resumirChequeo([sede("a")], [], [{
      ...venta("a", 50_000, 25_000),
      venta_items: [
        { cantidad: 1, producto_id: null, precio_unitario: 25_000, cristal_slot: 1, ordenes_trabajo: ot },
        { cantidad: 1, producto_id: null, precio_unitario: 25_000, cristal_slot: 2, ordenes_trabajo: ot },
        { ...armazon, cantidad: 2 },
      ],
    }, {
      ...venta("a", 5000, 5000),
      venta_items: [{ cantidad: 1, producto_id: null, precio_unitario: 5000, descripcion: "Consulta / receta" }],
    }], 0, 0, 0);
    expect(resumen).toMatchObject({ pares: 2, marcos: 2, ventas: 1, vendido: 55_000, comisionVentas: 5000, utilidad: 27_000 });
  });
});

describe("Caja del chequeo", () => {
  it("reserva reembolsos y laboratorio una sola vez aunque exista un pago parcial", () => {
    const compra: GastoChequeo = {
      id: "compra", descripcion: "Compra adelantada", fecha: "2026-11-25",
      monto: 34_000, caja: "personal", categoria: "compra_inventario",
      operativo_id: null, chequeo_id: "grupo", nota: null, monto_estimado: false,
    };
    const comida = { ...compra, id: "comida", caja: "efectivo", categoria: "otro", descripcion: "Comida · almuerzos", monto: 5000 };
    const laboratorio = { ...compra, id: "fides", chequeo_id: null, operativo_id: "a", caja: "digital", categoria: "otro", descripcion: "Fides · a", monto: 2000 };
    const items = [{
      cantidad: 1, producto_id: null, precio_unitario: 100_000,
      ordenes_trabajo: { estado: "listo", costo_laboratorio: 7000, costo_laboratorio_2: null,
        marco_propio: false, marco_propio_2: false, armazon_producto_id: null, armazon_producto_id_2: null },
    }];
    const resumen = resumirChequeo([sede("a")], [], [
      { ...venta("a", 100_000, 70_000), venta_items: items },
      { ...venta("a", 10_000, 0), venta_items: [{ ...items[0], ordenes_trabajo: null }] },
    ], gastoDeResultado(compra, []) + gastoDeResultado(comida, []), 0, 0);
    expect(resumen).toMatchObject({ porCobrar: 40_000, porCobrarEntrega: 30_000, utilidad: 82_000 });
    const parcial = resumirCajaChequeo(resumen, "grupo", [compra, comida, laboratorio], [],
      [{ gasto_id: compra.id, monto: 4000 }], [], new Set(), reglas);
    expect(parcial).toMatchObject({
      cristales: 7000, marcos: 5000, comida: 5000, fidesPendiente: 5000, porReembolsar: 30_000,
      cajaRegistrada: 59_000, saldoTrasPagos: 8_000, proyectado: 48_000,
    });
  });
});

it("excluye las consultas de la comisión del chequeo", () => {
  const consulta = {
    ...venta("b", 5000, 5000),
    venta_items: [{ cantidad: 1, producto_id: null, precio_unitario: 5000, descripcion: "Consulta / receta" }],
  };
  const n = resumirChequeo([sede("a"), sede("b")], [], [venta("a", 1_245_000, 750_000), consulta],
    130_000, 0, 0, 10, 275_000);
  expect(n).toMatchObject({
    vendido: 1_250_000, comisionVentas: 124_500, reservaCompraPersonal: 275_000,
    porCobrar: 495_000,
  });
});

it("descuenta el IVA antes del ahorro y no vuelve a reservar un pago del SII ya asignado a la caja", () => {
  const n = resumirChequeo([sede("a")], [], [venta("a", 100_000, 70_000)],
    0, 0, 0, 10, 0, 10_000);
  expect(n).toMatchObject({
    iva: 10_000, comisionVentas: 10_000,
  });
  const abonoSii: GastoChequeo = {
    id: "f29", fecha: "2026-12-01", descripcion: "Pago de impuesto", monto: 4000, caja: "digital",
    categoria: "otro", operativo_id: null, chequeo_id: "grupo", nota: null, monto_estimado: false,
  };
  const caja = resumirCajaChequeo(n, "grupo", [abonoSii], [], [], [], new Set([abonoSii.id]), reglas);
  expect(caja).toMatchObject({ gastosPagados: 4000, ivaPendienteCaja: 6000, saldoTrasPagos: 50_000 });
  expect(resumirCajaChequeo(n, "grupo", [], [], [], [], new Set(), reglas).saldoTrasPagos).toBe(caja.saldoTrasPagos);
});

it("aplica una reposición pagada a la reserva de marcos y registra su desembolso completo", () => {
  const compra: GastoChequeo = {
    id: "compra", fecha: "2026-11-25", descripcion: "Reposición de marcos · comprobante",
    monto: 7_000, caja: "digital", categoria: "compra_inventario",
    operativo_id: null, chequeo_id: "grupo", nota: null, monto_estimado: false,
  };
  const adelanto = { ...compra, id: "personal", caja: "personal", descripcion: "Compra inicial", monto: 10_000 };
  const ventaLente = { ...venta("a", 100_000, 70_000), venta_items: [{
    cantidad: 1, producto_id: null, precio_unitario: 100_000,
    ordenes_trabajo: { costo_laboratorio: 6000, costo_laboratorio_2: null, estado: "laboratorio",
      marco_propio: false, marco_propio_2: false, armazon_producto_id: null, armazon_producto_id_2: null },
  }] };
  const n = resumirChequeo([sede("a")], [], [ventaLente], 0, 0, 0, 10, 10_000, 10_000);
  const calcular = (gastos: GastoChequeo[], devuelto = 0) => resumirCajaChequeo(n, "grupo", gastos, [],
    [{ gasto_id: adelanto.id, monto: devuelto }], [], new Set(), reglas);

  const antes = calcular([adelanto]);
  expect(antes).toMatchObject({ marcos: 5000, marcosPendientes: 5000, porReembolsar: 10_000, proyectado: 59_000 });

  const despues = calcular([adelanto, compra]);
  expect(despues).toMatchObject({ marcos: 5000, coberturaMarcos: 5000, marcosPendientes: 0, gastosPagados: 7000,
    porReembolsar: 10_000, proyectado: 57_000, repartoPendiente: { ahorro: 11_400, madre: 22_800, pablo: 22_800 } });
  expect(calcular([adelanto, compra], 10_000)).toMatchObject({ porReembolsar: 0, reintegrosPagados: 10_000, proyectado: 57_000 });
  expect(calcular([adelanto, { ...compra, monto: 3000 }])).toMatchObject({ coberturaMarcos: 3000, marcosPendientes: 2000, proyectado: 59_000 });
});

it("cuadra el ejemplo de la auditoría y difiere el reparto hasta que entre el saldo", () => {
  const operativo = { ...sede("a"), costo_transporte: 20_000, costo_equipos: 52_000 };
  const lente = (total: number, pagado: number, medio: string, costo: number, marcoPropio: boolean) => ({
    ...venta("a", total, pagado),
    pagos_abonos: [{ monto: pagado, medio_pago: medio }],
    venta_items: [{ cantidad: 1, producto_id: null, precio_unitario: total, ordenes_trabajo: {
      costo_laboratorio: costo, costo_laboratorio_2: null, marco_propio: marcoPropio, marco_propio_2: false,
      armazon_producto_id: null, armazon_producto_id_2: null,
    } }],
  });
  const resumen = resumirChequeo([operativo], [], [
    lente(120_000, 120_000, "debito", 30_000, false),
    lente(90_000, 40_000, "efectivo", 25_000, true),
    { ...venta("a", 5000, 5000), venta_items: [{ cantidad: 1, producto_id: null,
      precio_unitario: 5000, descripcion: "Consulta / receta" }] },
  ], 0, 2, 0, 10, 0, 34_328);
  const caja = resumirCajaChequeo(resumen, "grupo", [], [], [], [], new Set(), reglas);
  expect(caja).toMatchObject({ marcos: 5000, comisionPendiente: 21_000, saldoTrasPagos: -24_728, proyectado: 25_272 });
  expect(caja.repartoPendiente).toEqual({ isadora: 21_000, ahorro: 5054, madre: 10_109, pablo: 10_109 });
  expect(caja.pagableConCaja(1_000_000)).toEqual({ isadora: 0, ahorro: 0, madre: 0, pablo: 0 });
});

it("limita los pagos de socios y ahorro a caja incluso si hubo un retiro por sobre la participación", () => {
  const resumen = resumirChequeo([sede("a")], [], [venta("a", 100_000, 100_000)], 0, 0, 0, 10);
  const caja = resumirCajaChequeo(resumen, "grupo", [], [], [], [{ persona: "madre", monto: 50_000 }], new Set(), reglas);
  const pagable = caja.pagableConCaja(10_000);
  expect(pagable.madre).toBe(0);
  expect(pagable.pablo + pagable.ahorro).toBe(10_000);
  expect(pagable.isadora).toBe(10_000);
});
