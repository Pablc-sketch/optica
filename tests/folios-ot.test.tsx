import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import TableroOT from "../src/app/(app)/(protegido)/ot/page";

const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (tabla: string) => {
      const query = { select: () => query, eq: () => query, in: () => query, not: () => query,
        order: () => query, range: () => range(tabla), maybeSingle: async () => ({ data: { id: "prueba" } }) };
      return query;
    },
  }),
}));
vi.mock("@/lib/mercadopago-sync", () => ({ mercadoPagoConfigurado: () => false }));
vi.mock("@/lib/actions/ot", () => ({ avanzarOT: async () => {}, retrocederOT: async () => {} }));
vi.mock("@/components/abono-form", () => ({ default: () => null }));
vi.mock("@/app/(app)/(protegido)/ot/eliminar-ot", () => ({ default: () => null }));
vi.mock("@/lib/avisos", () => ({ rutaAvisoEntrega: () => null }));
vi.mock("@/lib/fechas", async (original) => ({
  ...await original<typeof import("@/lib/fechas")>(),
  hoyEnChile: () => "2030-06-03",
}));

const baseOT = {
  id: "orden", paciente_id: "paciente", fecha_ingreso: "2030-06-01T12:00:00Z", fecha_entrega_estimada: "2030-06-14",
  folio: 301, estado: "recepcion", operativo_id: "costera",
  tipo_lente: "Monofocal", tipo_lente_2: null, recetas: { operativo_id: "costera" }, pacientes: { nombre: "Paciente de prueba" },
};
const sede = {
  id: "costera", nombre: "Sede Costera", fecha: "2030-06-01", hora_inicio: "09:00:00", fecha_entrega_estimada: "2030-06-14", estado: "realizado",
};
const central = { ...sede, id: "central", nombre: "Sede Central", hora_inicio: "17:00:00" };

function datos(ordenes: unknown[]) {
  const tablas: Record<string, unknown[]> = { ordenes_trabajo: ordenes, operativos: [central, sede], venta_items: [] };
  range.mockImplementation((tabla: string) => Promise.resolve({ data: tablas[tabla], error: null }));
}

it("muestra Sede Costera primero y conserva los saltos de folio para preparar las bolsas", async () => {
  datos([
    { ...baseOT, id: "central-310", folio: 310, operativo_id: "central", recetas: null },
    ...[312, 301, 302, 304, 305, 306, 309].map(folio => ({
      ...baseOT, id: `costera-${folio}`, folio, tipo_lente_2: [305, 312].includes(folio) ? "Monofocal" : null,
    })),
  ]);
  const html = renderToStaticMarkup(await TableroOT());
  expect(html.indexOf("Sede Costera")).toBeLessThan(html.indexOf("Sede Central"));
  expect(html).toContain("OT #301 a #312 · 7 OT · 9 pares");
  expect(html).toContain("301–302, 304–306, 309, 312");
  expect(html).toContain("OT #310 · 1 OT · 1 par");
  expect(html).toContain("Copiar folios de Sede Costera");
});

it("muestra una OT con sedes contradictorias fuera de los folios para las bolsas", async () => {
  datos([{ ...baseOT, recetas: { operativo_id: "central" } }]);
  const html = renderToStaticMarkup(await TableroOT());
  expect(html).toContain("Revisar operativo · 1 OT");
  expect(html).toContain("OT #301");
  expect(html).not.toContain("Folios para las bolsas");
});
