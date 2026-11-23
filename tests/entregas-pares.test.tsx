import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import Entregas from "../src/app/(app)/(protegido)/entregas/page";

const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const query = { select: () => query, eq: () => query, order: () => query, range };
    return { from: () => query };
  },
}));
vi.mock("@/app/(app)/(protegido)/cobros/tarjeta-cobro", () => ({ default: () => <li>Venta de prueba</li> }));

it("cuenta ambos pares listos y el par que sigue en laboratorio dentro de la misma venta", async () => {
  const listo = { id: "ot-1", estado: "listo", tipo_lente: "Monofocal", tipo_lente_2: "Monofocal" };
  const proceso = { id: "ot-2", estado: "laboratorio", tipo_lente: "Monofocal", tipo_lente_2: null };
  range.mockResolvedValue({ data: [{
    id: "venta", total: 150000, pacientes: { nombre: "Paciente de prueba" },
    operativos: { id: "sede", nombre: "Sede de prueba", fecha: "2026-11-23" },
    pagos_abonos: [{ monto: 50000 }],
    venta_items: [listo, listo, proceso].map(ordenes_trabajo => ({ descripcion: "Cristal", ordenes_trabajo })),
  }], error: null });
  const html = renderToStaticMarkup(await Entregas());
  expect(html).toContain("2 pares listos · 1 en laboratorio");
  expect(html).toContain("2 pares listos</b> · 1 en laboratorio");
});
