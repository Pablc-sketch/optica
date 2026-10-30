import { describe, expect, it } from "vitest";
import { compararEmisor, pendientesCompra, rutReembolso, type CompraReembolso } from "../src/lib/reembolso";

const compra: CompraReembolso = {
  id: "venta", fecha: "2026-10-01", total: 100, anulada: false,
  paciente: { nombre: "Paciente de prueba", rut: "12.345.678-5" },
  optica: { nombre_comercial: "Prueba", razon_social: "Empresa de prueba", rut_empresa: "76.000.000-0" },
  items: [{ descripcion: "Cristales de prueba", cantidad: 1, precio_unitario: 100, descuento: 0 }],
  pagos: [{ id: "pago", fecha: "2026-10-01", monto: 100, medio_pago: "debito", numero_voucher: "000123" }],
};

describe("cotejo de RUT del emisor", () => {
  it("comprueba el dígito verificador y normaliza puntos y guion", () => {
    expect(rutReembolso("12.345.678-5")).toBe("123456785");
    expect(rutReembolso("76.000.000-0")).toBe("760000000");
    expect(rutReembolso("12.345.678-9")).toBeNull();
    expect(rutReembolso("abc123456785")).toBeNull();
    expect(rutReembolso("00000000-0")).toBeNull();
  });
  it("no da por cotejado un voucher sin leer el original", () => {
    expect(compararEmisor(compra.optica?.rut_empresa, "")).toBe("pendiente");
    expect(compararEmisor(null, "76.000.000-0")).toBe("invalido");
    expect(compararEmisor(compra.optica?.rut_empresa, "76.000.000-9")).toBe("invalido");
  });
  it("detecta un RUT personal distinto aunque el voucher tenga número", () => {
    expect(compararEmisor(compra.optica?.rut_empresa, "12.345.678-5")).toBe("distinto");
    expect(compararEmisor(compra.optica?.rut_empresa, "760000000")).toBe("coincide");
  });
});

describe("revisión de compra para reembolso", () => {
  it("acepta datos coherentes sin prometer aprobación", () => expect(pendientesCompra(compra)).toEqual([]));
  it("identifica cada abono sin voucher y no exige voucher al efectivo", () => {
    expect(pendientesCompra({ ...compra, pagos: [...compra.pagos, { ...compra.pagos[0], id: "otro", monto: 0, numero_voucher: null }] })).toEqual([]);
    expect(pendientesCompra({ ...compra, pagos: [{ ...compra.pagos[0], numero_voucher: null }] }).join(" ")).toContain("cada voucher");
    expect(pendientesCompra({ ...compra, pagos: [{ ...compra.pagos[0], medio_pago: "efectivo", numero_voucher: null }] })).toEqual([]);
  });
  it("advierte precios cero sin repartir artificialmente el precio del conjunto", () => {
    const conMarco = { ...compra, items: [...compra.items, { descripcion: "Marco de prueba", cantidad: 1, precio_unitario: 0, descuento: 0 }] };
    expect(pendientesCompra(conMarco).join(" ")).toContain("sin inventar valores");
    expect(conMarco.items[1].precio_unitario).toBe(0);
  });
  it("usa el folio de boleta como respaldo alternativo sin omitir los demás pendientes", () => {
    const sinVoucher = { ...compra, pagos: [{ ...compra.pagos[0], numero_voucher: null }] };
    expect(pendientesCompra(sinVoucher).join(" ")).toContain("cada voucher");
    expect(pendientesCompra({ ...sinVoucher, boleta_folio: "123" })).toEqual([]);
    const pendientes = pendientesCompra({ ...sinVoucher, boleta_folio: "123", total: 200 }).join(" ");
    expect(pendientes).toContain("no coincide");
    expect(pendientes).toContain("saldo pendiente");
    expect(pendientes).not.toContain("cada voucher");
  });
  it("detecta total incoherente, saldo y exceso de pagos", () => {
    expect(pendientesCompra({ ...compra, total: 200 }).join(" ")).toContain("no coincide");
    expect(pendientesCompra({ ...compra, pagos: [] }).join(" ")).toContain("saldo pendiente");
    expect(pendientesCompra({ ...compra, pagos: [{ ...compra.pagos[0], monto: 101 }] }).join(" ")).toContain("superan");
  });
  it("rechaza datos incompletos y anulaciones", () => {
    const resultado = pendientesCompra({ ...compra, anulada: true, paciente: null, optica: null, items: [] }).join(" ");
    expect(resultado).toContain("anulada");
    expect(resultado).toContain("paciente");
    expect(resultado).toContain("razón social");
    expect(resultado).toContain("descripciones");
  });
});
