// Controles de la auditoría financiera (datos ficticios).
import { describe, expect, it } from "vitest";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";
import { resumirCajaChequeo } from "@/lib/caja-chequeo";
import { repartoPorOperativo } from "@/lib/reparto-operativos";
import { numerosDeOperativo } from "@/lib/cierre-operativo";
import { cuentasDelChequeo } from "@/lib/resumen-chequeo";

const reglas = { ahorroPct: 20, parteMadrePct: 50 };
const sede = (extra: Partial<SedeChequeo> = {}) => ({
  id: "op", nombre: "Operativo de prueba", fecha: "2026-11-20", fecha_fin: null, estado: "realizado", direccion: null, chequeo_id: "c",
  costo_transporte: 40_000, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, costo_ayudante: 0, costo_equipos: 0,
  costo_hospedaje: 0, costo_comida: 0, costo_peajes: 0, comision_vendedora_pct: 0, comision_vendedora_base: "venta_total", ahorro_pct: 20, ...extra,
}) as SedeChequeo;
const ot = (costo: number, marco: number) => ({ estado: "entregado", costo_laboratorio: costo, costo_laboratorio_2: null, marco_propio: false,
  marco_propio_2: false, armazon_producto_id: "m", armazon_producto_id_2: null, marco_1: { costo: marco } });
const ventaControl = (cobrado: number) => [{ operativo_id: "op", total: 300_000, pagos_abonos: [{ monto: cobrado, medio_pago: "efectivo" }],
  venta_items: [{ cantidad: 1, cristal_slot: 1, descripcion: "Lentes", producto_id: null, precio_unitario: 300_000, ordenes_trabajo: ot(60_000, 30_000) }] }] as unknown as VentaChequeo[];

function control(cobrado: number) {
  const n = resumirChequeo([sede()], [], ventaControl(cobrado), 0, 0, 0, 0, 0, 0);
  const caja = resumirCajaChequeo(n, "c", [], [], [], [], new Set(), reglas);
  const datos = { n: { ...n, reparto: caja.reparto }, caja, ventas: ventaControl(cobrado), sii: null, ivaSinCredito: false,
    retirosSinAsignar: false, tenant: null, gastosEquipos: 0 } as never;
  const saldos = { efectivo: null, efectivoVerificado: false, saldoConfirmado: null, deudaPersonal: 0, devoluciones: 0, cuenta: { estado: "error" } } as never;
  const operativos = repartoPorOperativo(n, caja, [], new Map());
  return { n, caja, resumen: cuentasDelChequeo(datos, saldos, { comision_isadora_pct: 0, ahorro_pct: 20 }), operativo: operativos[0],
    cierre: numerosDeOperativo(sede(), ventaControl(cobrado), 0, 0).cierre };
}

describe("control aritmético: $300.000 vendidos, $60.000 cristales, $30.000 marcos, $40.000 gastos", () => {
  it("la utilidad antes del reparto es $170.000 en todas las vistas", () => {
    const c = control(180_000);
    expect(c.n).toMatchObject({ vendido: 300_000, cobrado: 180_000, porCobrar: 120_000, utilidad: 170_000 });
    expect(c.caja.proyectado).toBe(170_000);
    expect(c.resumen.resultado).toBe(170_000);
    expect(c.resumen.vendido - c.resumen.gastos.total).toBe(170_000);
    expect(c.operativo.utilidad).toBe(170_000);
    expect(c.cierre.utilidad).toBe(170_000);
  });
  it("al cobrar los $120.000 cambian Caja y Por cobrar, pero la utilidad sigue en $170.000", () => {
    const antes = control(180_000);
    const despues = control(300_000);
    expect(despues.n.porCobrar).toBe(0);
    expect(despues.caja.cajaRegistrada - antes.caja.cajaRegistrada).toBe(120_000);
    for (const v of [despues.n.utilidad, despues.caja.proyectado, despues.resumen.resultado, despues.operativo.utilidad, despues.cierre.utilidad]) {
      expect(v).toBe(170_000);
    }
    expect(despues.caja.reparto).toEqual(antes.caja.reparto);
  });
});

it("una venta de tres pares con dos órdenes de trabajo se cuenta una sola vez", () => {
  const otA = { ...ot(20_000, 9000), costo_laboratorio_2: 25_000, marco_2: { costo: 14_000 }, armazon_producto_id_2: "m2" };
  const otB = ot(30_000, 0);
  const venta = [{ operativo_id: "op", total: 270_000, pagos_abonos: [{ monto: 100_000, medio_pago: "debito" }, { monto: 50_000, medio_pago: "efectivo" }],
    venta_items: [
      { cantidad: 1, cristal_slot: 1, descripcion: "Par 1", producto_id: null, precio_unitario: 90_000, ordenes_trabajo: otA },
      { cantidad: 1, cristal_slot: 2, descripcion: "Par 2", producto_id: null, precio_unitario: 90_000, ordenes_trabajo: otA },
      { cantidad: 1, cristal_slot: 1, descripcion: "Par 3", producto_id: null, precio_unitario: 90_000, ordenes_trabajo: otB },
    ] }] as unknown as VentaChequeo[];
  const n = resumirChequeo([sede({ costo_transporte: 0 })], [], venta, 0, 0, 0, 0, 0, 0);
  expect(n).toMatchObject({ vendido: 270_000, cobrado: 150_000, porCobrar: 120_000, pares: 3, marcos: 3, ventas: 1 });
  expect(n.filas[0].desglose).toMatchObject({ totalCristales: 75_000, totalArmazones: 9000 + 14_000 + 5000 });
});

describe("cuadre de caja y gastos en la pantalla", () => {
  const armar = (saldos: Record<string, unknown>) => {
    const n = resumirChequeo([sede()], [], ventaControl(180_000), 0, 0, 0, 0, 0, 25_000);
    const caja = resumirCajaChequeo(n, "c", [], [], [], [], new Set(), reglas);
    const datos = { n: { ...n, reparto: caja.reparto }, caja, ventas: ventaControl(180_000), sii: null, ivaSinCredito: true,
      retirosSinAsignar: false, tenant: null, gastosEquipos: 0 } as never;
    return cuentasDelChequeo(datos, { efectivo: 180_000, efectivoVerificado: false, deudaPersonal: 0, devoluciones: 0,
      saldoConfirmado: null, cuenta: { estado: "error" }, bancoRegistrado: null, ...saldos } as never, { comision_isadora_pct: 0, ahorro_pct: 20 });
  };
  it("separa lo ya pagado, lo que falta pagar y el IVA que hay que guardar", () => {
    const c = armar({});
    // Nada pagado aún: cristales 60.000 + marcos 30.000 + transporte 40.000 por pagar; IVA 25.000 por guardar.
    expect(c.gastos).toMatchObject({ porPagar: 130_000, ivaGuardar: 25_000, pagado: 0 });
    expect(c.gastos.pagado + c.gastos.porPagar + c.gastos.ivaGuardar).toBe(c.gastos.total);
  });
  it("si la cuenta real no calza con lo registrado, muestra la diferencia en vez de esconderla", () => {
    const c = armar({ saldoConfirmado: 1_432_487, bancoRegistrado: 2_008_807 });
    expect(c).toMatchObject({ cuentaDisponible: 1_432_487, cuentaSegunLentia: 2_008_807, diferenciaCuenta: -576_320 });
    expect(armar({}).diferenciaCuenta).toBeNull();
  });
});
