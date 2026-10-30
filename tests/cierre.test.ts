import { describe, expect, it } from "vitest";
import { calcularCierre } from "../src/lib/cierre";

describe("calcularCierre", () => {
  it("Piedra Roja con Diego $40.000 y ahorro 20% (números revisados con Pablo)", () => {
    const c = calcularCierre({
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
    });
    expect(c.isadora).toBe(98600);
    expect(c.comisionTarjeta).toBe(24559);
    expect(c.utilidad).toBe(573905);
    expect(c.gastoTotal).toBe(530695);
    expect(c.gananciaLiquida).toBe(475305);
    expect(c.gastoTotal + c.gananciaLiquida).toBe(1006000);
    expect(c.ahorro).toBe(95061);
    expect(c.madre + c.pablo).toBe(573905 - 98600 - 95061);
  });
});
