import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { query, exigirRolPagina } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "eq"]) query[m] = vi.fn(() => query);
  query.single = vi.fn();
  return { query, exigirRolPagina: vi.fn() };
});
vi.mock("@/lib/autorizacion", () => ({ exigirRolPagina }));
vi.mock("@/components/boton-imprimir", () => ({ default: () => <button>IMPRIMIR_PRUEBA</button> }));
import Certificado from "../src/app/(app)/(protegido)/ventas/[id]/certificado-fonasa/page";

function respuestas({ voucher = "000123", anulada = false, posicion = "cerca", cantidad = 2,
  estado = "listo", ocultarVoucher = false, boletaFolio = null as string | null,
  segundoPar = false, segundaPosicion = "" } = {}) {
  query.single.mockResolvedValueOnce({ data: { id: "venta", fecha: "2026-10-01T12:00:00Z", anulada,
    ocultar_voucher: ocultarVoucher, boleta_folio: boletaFolio,
    pacientes: { nombre: "Paciente de prueba", rut: "12.345.678-5", fecha_nacimiento: "1950-01-01" },
    venta_items: [{ cristal_slot: 1, cantidad, ordenes_trabajo: { tipo_lente: "Monofocal", posicion, estado } },
      ...(segundoPar ? [{ cristal_slot: 2, cantidad: 1, ordenes_trabajo: { tipo_lente_2: "Monofocal", posicion_2: segundaPosicion, estado: "montaje" } }] : [])],
    pagos_abonos: [{ monto: 100, medio_pago: "debito", numero_voucher: voucher }],
  }, error: null });
  query.single.mockResolvedValueOnce({ data: { nombre_comercial: "Prueba", razon_social: "Empresa prueba", rut_empresa: "76.000.000-0" }, error: null });
}
async function html() { return renderToStaticMarkup(await Certificado({ params: Promise.resolve({ id: "venta" }), searchParams: Promise.resolve({}) })); }

beforeEach(() => {
  vi.clearAllMocks();
  exigirRolPagina.mockResolvedValue({ tenantId: "optica-prueba", supabase: { from: vi.fn(() => query) } });
});
describe("certificado fiel a la venta", () => {
  it("muestra todos los cristales y conserva ceros del voucher sin inventar una boleta", async () => {
    respuestas();
    const documento = await html();
    expect(documento).toContain("4 lentes ópticos");
    expect(documento).toContain("000123");
    expect(documento).toContain("Número de boleta (si corresponde)");
    expect(documento).toContain("[X] Cerca");
    expect(documento).not.toContain("[X] Lejos");
    expect(documento).toContain("IMPRIMIR_PRUEBA");
    expect(exigirRolPagina).toHaveBeenCalledWith(["admin", "ventas"]);
    expect(query.eq).toHaveBeenCalledWith("tenant_id", "optica-prueba");
    expect(query.eq).toHaveBeenCalledWith("id", "optica-prueba");
  });
  it("no presume lejos cuando la orden no indica posición", async () => {
    respuestas({ posicion: "" });
    expect(await html()).not.toContain("[X] Lejos");
  });
  it("deja pendiente la impresión cuando falta el voucher original", async () => {
    respuestas({ voucher: "" });
    const documento = await html();
    expect(documento).not.toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain("Certificado pendiente");
  });
  it("no ofrece imprimir un certificado de venta anulada", async () => {
    respuestas({ anulada: true });
    expect(await html()).not.toContain("IMPRIMIR_PRUEBA");
  });
  it("solo certifica entrega cuando todas las órdenes del certificado están entregadas", async () => {
    respuestas({ estado: "listo" });
    expect(await html()).not.toContain("ENTREGADO");
    respuestas({ estado: "entregado" });
    expect(await html()).toContain("ENTREGADO");
    respuestas({ estado: "entregado", segundoPar: true, segundaPosicion: "lejos" });
    expect(await html()).not.toContain("ENTREGADO");
  });
  it("ocultar el voucher no evita revisar una referencia faltante", async () => {
    respuestas({ ocultarVoucher: true, voucher: "" });
    const documento = await html();
    expect(documento).not.toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain("los números de voucher");
    expect(documento).not.toContain("Número(s) de voucher:");
  });
  it("permite usar el folio de boleta como respaldo aunque no haya voucher", async () => {
    respuestas({ ocultarVoucher: true, voucher: "", boletaFolio: "123" });
    expect(await html()).toContain("IMPRIMIR_PRUEBA");
  });
  it("un par completo no encubre la prestación incompleta del segundo", async () => {
    respuestas({ segundoPar: true });
    const documento = await html();
    expect(documento).not.toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain("la prestación de cada par");
  });
  it("conserva la opción explícita de completar la prestación a mano", async () => {
    respuestas({ segundoPar: true });
    const documento = renderToStaticMarkup(await Certificado({ params: Promise.resolve({ id: "venta" }), searchParams: Promise.resolve({ prestacion: "mano" }) }));
    expect(documento).toContain("IMPRIMIR_PRUEBA");
    expect(documento).not.toContain("[X]");
  });
});
