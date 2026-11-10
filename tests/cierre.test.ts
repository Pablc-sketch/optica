import { describe, expect, it } from "vitest";
import { calcularCierre, type EntradaCierre } from "../src/lib/cierre";
import { leerReparto } from "../src/lib/configuracion-optica";
import { calcularSueldos } from "../src/lib/sueldos";

// El reparto que la migración 20261110120000 guarda para Óptica Global.
const REPARTO_OPTICA_GLOBAL = leerReparto({
  vendedora: { clave: "isadora", nombre: "Isadora" },
  ahorro: { clave: "ahorro", nombre: "Ahorro del negocio" },
  socios: [
    { clave: "madre", nombre: "Mamá", pct: 50 },
    { clave: "pablo", nombre: "Pablo", pct: 50 },
  ],
});

const PIEDRA_ROJA: EntradaCierre = {
  vendido: 1006000,
  consultas: 20000,
  costoCristales: 185536,
  costoMarcos: 80000,
  gastosOperativo: 50000 + 52000 + 40000,
  cobradoDebito: 357000 + 15000,
  cobradoCredito: 557000 + 5000,
  pctDebito: 2.13,
  pctCredito: 2.96,
  comisionVendedoraPct: 10,
  comisionVendedoraBase: "venta_total",
  ahorroPct: 20,
};

describe("calcularCierre", () => {
  it("Piedra Roja con Diego $40.000 y ahorro 20% (números revisados con Pablo)", () => {
    const c = calcularCierre(PIEDRA_ROJA, REPARTO_OPTICA_GLOBAL);
    expect(c.montos.isadora).toBe(98600);
    expect(c.comisionTarjeta).toBe(24559);
    expect(c.utilidad).toBe(573905);
    expect(c.gastoTotal).toBe(530695);
    expect(c.gananciaLiquida).toBe(475305);
    expect(c.gastoTotal + c.gananciaLiquida).toBe(1006000);
    expect(c.montos.ahorro).toBe(95061);
    expect(c.montos.madre + c.montos.pablo).toBe(573905 - 98600 - 95061);
  });

  it("Óptica Global: el reparto configurable da lo mismo que el cálculo anterior, peso a peso", () => {
    for (const vendido of [0, 48000, 986000, 1006000, 1234567]) {
      for (const utilidad of [-50000, 0, 1, 377777, 552839, 604839]) {
        const antes = calcularSueldos(vendido, utilidad, {
          comisionVendedoraPct: 10, comisionVendedoraBase: "venta_total", ahorroPct: 20, ventaSinComision: 20000,
        });
        const c = calcularCierre(
          { ...PIEDRA_ROJA, vendido, consultas: 20000, costoCristales: 0, costoMarcos: 0, gastosOperativo: 0,
            cobradoDebito: 0, cobradoCredito: 0, costoOtrosProductos: vendido - utilidad },
          REPARTO_OPTICA_GLOBAL
        );
        expect([c.montos.isadora, c.montos.ahorro, c.montos.madre, c.montos.pablo]).toEqual([
          antes.comisionIsadora, antes.ahorro, antes.parteMadre, antes.partePablo,
        ]);
      }
    }
  });

  it("Óptica sin reparto configurado: sin comisión, ahorro ni partes; la ganancia es la utilidad", () => {
    const c = calcularCierre(PIEDRA_ROJA, null);
    expect(c.comisionVendedora).toBe(0);
    expect(c.ahorro).toBe(0);
    expect(c.montos).toEqual({});
    expect(c.gananciaLiquida).toBe(c.utilidad);
  });

  it("Otra óptica con tres socios: el reparto cuadra al peso", () => {
    const reparto = leerReparto({
      vendedora: { clave: "vendedor", nombre: "Vendedor" },
      ahorro: { clave: "fondo", nombre: "Fondo" },
      socios: [
        { clave: "a", nombre: "A", pct: 40 },
        { clave: "b", nombre: "B", pct: 30 },
        { clave: "c", nombre: "C", pct: 30 },
      ],
    });
    const c = calcularCierre({ ...PIEDRA_ROJA, comisionVendedoraPct: 5, ahorroPct: 10 }, reparto);
    const resto = c.utilidad - c.comisionVendedora - c.ahorro;
    expect(c.montos.a + c.montos.b + c.montos.c).toBe(resto);
    expect(c.montos.a).toBe(Math.round(resto * 0.4));
  });
});
