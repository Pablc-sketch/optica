import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { query, exigirRolPagina } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const metodo of ["select", "eq"]) query[metodo] = vi.fn(() => query);
  query.single = vi.fn();
  return { query, exigirRolPagina: vi.fn() };
});
vi.mock("@/lib/autorizacion", () => ({ exigirRolPagina }));
vi.mock("@/components/boton-imprimir", () => ({ default: () => <button>IMPRIMIR_PRUEBA</button> }));
vi.mock("@/components/copiar-para-sii", () => ({ default: () => null }));
vi.mock("@/components/completar-voucher", () => ({ default: () => <span>COMPLETAR_VOUCHER_PRUEBA</span> }));
vi.mock("../src/app/(app)/(protegido)/ventas/anular-venta", () => ({ default: () => null }));
import Comprobante from "../src/app/(app)/(protegido)/ventas/[id]/comprobante/page";

function respuestas({ ocultar = false, voucher = "000123", folio = null as string | null } = {}) {
  query.single.mockResolvedValueOnce({ data: {
    id: "venta-prueba", fecha: "2026-10-01T12:00:00Z", total: 100, anulada: false,
    estado_pago: "pagado", ocultar_voucher: ocultar, boleta_folio: folio,
    pacientes: null, venta_items: [],
    pagos_abonos: [{ id: "pago-prueba", fecha: "2026-10-01T12:00:00Z", monto: 100, medio_pago: "debito", numero_voucher: voucher }],
  }, error: null });
  query.single.mockResolvedValueOnce({ data: { nombre_comercial: "Óptica de prueba", razon_social: "Empresa de prueba", rut_empresa: "76.000.000-0" }, error: null });
}
async function html() {
  return renderToStaticMarkup(await Comprobante({ params: Promise.resolve({ id: "venta-prueba" }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  exigirRolPagina.mockResolvedValue({ tenantId: "optica-prueba", supabase: { from: vi.fn(() => query) } });
});

describe("respaldo del comprobante", () => {
  it.each([true, false])("bloquea la impresión y el PDF si falta voucher sin folio, ocultar=%s", async ocultar => {
    respuestas({ ocultar, voucher: "" });
    const documento = await html();
    expect(documento).not.toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain("COMPLETAR_VOUCHER_PRUEBA");
    expect(documento).toContain('data-pdf-ready="no"');
  });
  it("oculta la referencia válida sin afectar la preparación del documento", async () => {
    respuestas({ ocultar: true });
    const documento = await html();
    expect(documento).toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain('data-pdf-ready="si"');
    expect(documento).not.toContain("Operación / voucher:");
  });
  it("acepta el folio guardado como respaldo alternativo al voucher", async () => {
    respuestas({ ocultar: true, voucher: "", folio: "000456" });
    const documento = await html();
    expect(documento).toContain("IMPRIMIR_PRUEBA");
    expect(documento).toContain('data-pdf-ready="si"');
    expect(documento).toContain("000456");
    expect(documento).not.toContain("COMPLETAR_VOUCHER_PRUEBA");
  });
});
