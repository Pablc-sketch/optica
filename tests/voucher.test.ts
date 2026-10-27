import { describe, expect, it } from "vitest";
import { requiereVoucher, validarVoucher } from "../src/lib/voucher";

describe("voucher por pago de tarjeta", () => {
  it.each(["debito", "credito"])("exige voucher para %s", (medio) => {
    expect(validarVoucher(medio, 80000, " ").error).toBeDefined();
    expect(validarVoucher(medio, 80000, null).error).toBeDefined();
  });
  it("conserva ceros iniciales e identificadores largos", () => {
    expect(validarVoucher("debito", 80000, " 00012345678901234567890 ")).toEqual({ numero: "00012345678901234567890" });
  });
  it.each(["sin voucher", "<script>123</script>", "123\n456", "a".repeat(81), "pendiente", {}])("rechaza referencias inválidas: %s", (numero) => {
    expect(validarVoucher("credito", 145000, numero).error).toBeDefined();
  });
  it.each(["efectivo", "transferencia"])("no inventa voucher para %s", (medio) => {
    expect(validarVoucher(medio, 80000, "")).toEqual({ numero: null });
  });
  it("no exige voucher si la venta no cobra nada ahora", () => {
    expect(requiereVoucher("credito", 0)).toBe(false);
    expect(validarVoucher("credito", 0, "")).toEqual({ numero: null });
  });
});
