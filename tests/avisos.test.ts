import { describe, expect, it } from "vitest";
import { clasificarAvisos, fraseListos, type VentaParaAviso } from "../src/lib/avisos";

const venta = (p: Partial<VentaParaAviso>): VentaParaAviso => ({
  id: "v",
  pacienteId: "p1",
  nombre: "Ana",
  telefono: "56911111111",
  total: 100000,
  pagado: 40000,
  anulada: false,
  ordenes: [],
  ...p,
});

describe("clasificarAvisos (F04)", () => {
  it("orden en laboratorio no recibe 'están listos'", () => {
    const r = clasificarAvisos([venta({ ordenes: [{ id: "o", estado: "laboratorio", pares: 1 }] })]);
    expect(r.listos).toHaveLength(0);
    expect(r.enProceso).toHaveLength(1);
  });

  it("entregado, cancelado o anulado quedan fuera", () => {
    const r = clasificarAvisos([
      venta({ id: "a", ordenes: [{ id: "o1", estado: "entregado", pares: 1 }] }),
      venta({ id: "b", pacienteId: "p2", ordenes: [{ id: "o2", estado: "cancelado", pares: 1 }] }),
      venta({ id: "c", pacienteId: "p3", anulada: true, ordenes: [{ id: "o3", estado: "listo", pares: 1 }] }),
    ]);
    expect(r.listos).toHaveLength(0);
    expect(r.enProceso).toHaveLength(0);
  });

  it("parcial: uno listo y otro en laboratorio", () => {
    const r = clasificarAvisos([
      venta({
        ordenes: [
          { id: "o1", estado: "listo", pares: 2 },
          { id: "o2", estado: "laboratorio", pares: 1 },
        ],
      }),
    ]);
    expect(r.listos[0]).toMatchObject({ paresListos: 2, paresPendientes: 1 });
    expect(fraseListos(r.listos[0])).toContain("2 de sus 3 pares");
  });

  it("dos ventas del mismo paciente: un aviso y el saldo de cada venta una sola vez", () => {
    const r = clasificarAvisos([
      venta({ id: "a", total: 100000, pagado: 40000, ordenes: [{ id: "o1", estado: "listo", pares: 2 }] }),
      venta({ id: "b", total: 50000, pagado: 50000, ordenes: [{ id: "o2", estado: "listo", pares: 1 }] }),
    ]);
    expect(r.listos).toHaveLength(1);
    expect(r.listos[0].saldo).toBe(60000);
    expect(r.listos[0].ventaIds).toEqual(["a", "b"]);
  });
});
