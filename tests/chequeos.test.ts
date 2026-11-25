import { describe, expect, it } from "vitest";
import { resumirChequeo, type SedeChequeo, type VentaChequeo } from "@/lib/chequeos";

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
    ], [venta("a", 50_000, 60_000), venta("b", 30_000, 15_000)], 5000, 20, 0, 0);
    expect(resumen).toMatchObject({
      pacientes: 2, ventas: 2, vendido: 80_000, cobrado: 75_000, porCobrar: 15_000,
      utilidad: 67_000, gastosCompartidos: 5000, comisionVentas: 8000,
      reparto: { ahorro: 13_400, partePablo: 26_800, parteMadre: 26_800 },
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
    }], 0, 20, 0, 0);
    expect(resumen).toMatchObject({ pares: 2, marcos: 2, ventas: 1, vendido: 55_000, comisionVentas: 5000 });
  });
});
