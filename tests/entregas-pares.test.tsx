import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Entregas from "../src/app/(app)/(protegido)/entregas/page";

const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({
  exigirRolPagina: async () => ({
    tenantId: "optica", rol: "admin",
    supabase: { from: (tabla: string) => {
      const query = { select: () => query, eq: () => query, not: () => query, in: () => query,
        order: () => query, range: () => range(tabla) };
      return query;
    } },
  }),
}));
vi.mock("@/app/(app)/(protegido)/cobros/tarjeta-cobro", () => ({
  default: ({ fila }: { fila: { nombre: string; ordenes: { folio: number }[] } }) =>
    <li>{fila.nombre} {fila.ordenes.map(ot => ot.folio).join(", ")}</li>,
}));

function renderizar(chequeo?: string, op?: string) {
  return Entregas({ searchParams: Promise.resolve({ chequeo, op }) }).then(renderToStaticMarkup);
}

const sede = {
  id: "sede", nombre: "Sede Costera", fecha: "2030-06-01", chequeo_id: "chequeo",
  fecha_entrega_estimada: "2030-06-14", hora_entrega: null, lugar_entrega: null, direccion: "Sede Costera", estado: "realizado",
};
const club = { ...sede, id: "club", nombre: "Sede Central", fecha_entrega_estimada: null };
const paciente = { nombre: "Paciente de prueba", telefono: null };
const listo = {
  id: "ot-1", folio: 301, estado: "listo", tipo_lente: "Monofocal", tipo_lente_2: "Monofocal",
  operativo_id: "sede", recetas: { operativo_id: "sede" }, fecha_ingreso: "2030-06-01T12:00:00Z",
  pacientes: paciente, venta_items: [{ venta_id: "venta" }, { venta_id: "venta" }],
};
const proceso = { ...listo, id: "ot-2", folio: 302, estado: "laboratorio", tipo_lente_2: null };
const venta = {
  id: "venta", total: 150000, operativo_id: "sede", pacientes: paciente, pagos_abonos: [{ monto: 50000 }],
  venta_items: [listo, listo, proceso].map(ot => ({ ot_id: ot.id, ordenes_trabajo: ot })),
};

function datos(ordenes: unknown[], ventas: unknown[] = [venta]) {
  const tablas: Record<string, unknown[]> = {
    ordenes_trabajo: ordenes, ventas, operativos: [sede, club],
    chequeos: [{ id: "chequeo", nombre: "Chequeo 1", desde: "2030-06-01", hasta: "2030-06-03" }],
  };
  range.mockImplementation((tabla: string) => Promise.resolve({ data: tablas[tabla], error: null }));
}

it("agrupa dos OT en un pedido, cuenta cada par una vez y muestra el club con fecha por coordinar", async () => {
  datos([listo, proceso]);
  const html = await renderizar("chequeo");
  expect(html).toContain("1 pedido · 3 pares");
  expect(html).toContain("2 pares listos</b> · 1 en proceso");
  expect(html).toContain("Entrega planificada · 14-06-2030 (viernes)");
  expect(html).toContain("Fecha de entrega por coordinar");
  expect(html).toContain("Sede Central");
  expect(html).toContain("Paciente de prueba 301, 302");
});

it("recupera la sede de la receta para una OT antigua cuando la venta y la OT no la indican", async () => {
  datos([{ ...listo, operativo_id: null }], [{ ...venta, operativo_id: null }]);
  const html = await renderizar("chequeo", "sede");
  expect(html).toContain("Sede Costera");
  expect(html).toContain("1 pedido · 2 pares");
  expect(html).not.toContain("Órdenes por revisar");
  expect(html).not.toContain("Sede Central");
});

it("muestra las sedes contradictorias y las órdenes sin venta como casos por revisar", async () => {
  const huerfana = { ...proceso, venta_items: [] };
  datos([{ ...listo, recetas: { operativo_id: "club" } }, huerfana]);
  const html = await renderizar("chequeo", "sede");
  expect(html).toContain("0 pedidos · 0 pares");
  expect(html).toContain("Órdenes por revisar");
  expect(html).toContain("Sede Costera / Sede Central");
  expect(html).toContain("La OT no tiene una venta activa vinculada.");
  expect(html).toContain("OT #302");
});
