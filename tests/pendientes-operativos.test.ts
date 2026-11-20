import { describe, expect, it } from "vitest";
import { estimarCombustible, pendientesDeOperativos, promediosPropios, type OperativoRevisable } from "@/lib/pendientes-operativos";

// Datos ficticios.
const base = (id: string, extra: Partial<OperativoRevisable> = {}): OperativoRevisable => ({
  id, nombre: `Op ${id}`, fecha: "2030-03-10", fecha_fin: null, estado: "planificado", direccion: "Calle 1", comuna: "Talagante",
  hora_inicio: "10:00", meta_examenes: 30, costo_transporte: 20000, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0,
  costo_equipos: 52000, ...extra,
});
const HOY = "2030-03-01";

describe("pendientes de los operativos", () => {
  it("un operativo completo no tiene pendientes", () => {
    expect(pendientesDeOperativos([base("a")], new Map([["a", 20]]), HOY, new Set(["a"]))).toEqual([]);
  });

  it("detecta ubicación, horario, inscritos, costos y contacto", () => {
    const r = pendientesDeOperativos(
      [base("a", { direccion: null, comuna: null, hora_inicio: null, costo_transporte: 0, costo_equipos: 0 })],
      new Map(), HOY, new Set()
    );
    expect(r[0].problemas).toEqual([
      "Falta la ubicación (dirección y comuna).",
      "Falta el horario.",
      "No hay gente inscrita.",
      "Faltan los costos (transporte, equipos, comida…).",
      "Falta el contacto (dirigente o encargado del lugar).",
    ]);
  });

  it("pocos inscritos a una semana, varios días sin hospedaje, sin transporte", () => {
    const r = pendientesDeOperativos(
      [base("a", { fecha: "2030-03-05", fecha_fin: "2030-03-06", costo_transporte: 0 })],
      new Map([["a", 5]]), HOY
    );
    expect(r[0].problemas).toEqual([
      "Pocos inscritos: 5 de una meta de 30.",
      "Falta el costo de transporte o combustible.",
      "Dura 2 días y no tiene hospedaje anotado.",
    ]);
  });

  it("operativos pasados: sin cerrar o realizados sin costos; cancelados no", () => {
    const r = pendientesDeOperativos([
      base("viejo", { fecha: "2030-02-01" }),
      base("sincostos", { fecha: "2030-02-10", estado: "realizado", costo_transporte: 0, costo_equipos: 0 }),
      base("cancelado", { fecha: "2030-03-03", estado: "cancelado", direccion: null }),
      base("proximo", { fecha: "2030-03-03", hora_inicio: null }),
    ], new Map([["proximo", 10]]), HOY);
    expect(r.map((p) => p.operativo_id)).toEqual(["proximo", "sincostos", "viejo"]);
    expect(r[2].problemas[0]).toContain("sigue como planificado");
    expect(r[1].problemas[0]).toContain("sin costos");
  });
});

describe("costos en Chile", () => {
  it("combustible: un viaje por día, o uno solo si se alojan", () => {
    expect(estimarCombustible({ km_ida: 40, dias: 2, precio_litro: 1300, rendimiento_km_litro: 10 })).toMatchObject({ km_total: 160, litros: 16, costo: 20800 });
    expect(estimarCombustible({ km_ida: 200, dias: 3, precio_litro: 1000, rendimiento_km_litro: 10, se_aloja: true })).toMatchObject({ km_total: 400, litros: 40, costo: 40000 });
  });

  it("promedio propio por día, solo con operativos que anotaron el gasto", () => {
    const p = promediosPropios([
      { fecha: "2030-01-10", fecha_fin: null, estado: "realizado", costo_transporte: 30000, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, costo_hospedaje: 0 },
      { fecha: "2030-02-10", fecha_fin: "2030-02-11", estado: "realizado", costo_transporte: 60000, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0, costo_hospedaje: 80000 },
      { fecha: "2028-01-10", fecha_fin: null, estado: "realizado", costo_transporte: 999999, costo_arriendo: 0, costo_viaticos: 0, costo_otros: 0 },
    ], HOY);
    expect(p.transporte).toEqual({ promedio_por_dia: 30000, operativos: 2 });
    expect(p.hospedaje).toEqual({ promedio_por_dia: 40000, operativos: 1 });
    expect(p.arriendo).toBeUndefined();
  });
});
