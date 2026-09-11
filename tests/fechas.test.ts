import { describe, expect, it } from "vitest";
import {
  desfaseChile,
  diaDeLaSemana,
  diaEnChile,
  fechaConDia,
  finDelDia,
  inicioDelDia,
  diasQueOcupa,
  haceCuanto,
  mesDesplazado,
  rangoHorario,
  restarDias,
  semanasDelMes,
  sumarMeses,
} from "../src/lib/fechas";

describe("desfase horario de Chile", () => {
  it("usa -04:00 en invierno y -03:00 en verano", () => {
    expect(desfaseChile("2026-08-15")).toBe("-04:00");
    expect(desfaseChile("2026-01-15")).toBe("-03:00");
  });
});

describe("día chileno de un instante guardado", () => {
  it("una orden de las 21:30 en Chile pertenece a ese día, no al siguiente", () => {
    // 15/08 21:30 en Santiago = 16/08 01:30 UTC
    expect(diaEnChile("2026-08-16T01:30:00Z")).toBe("2026-08-15");
  });

  it("una orden de la mañana cae en el día esperado", () => {
    expect(diaEnChile("2026-08-15T13:00:00Z")).toBe("2026-08-15");
  });
});

describe("límites del rango de días", () => {
  it("incluye una orden tomada de noche en Chile, que en UTC ya es el día siguiente", () => {
    const orden = new Date("2026-08-16T01:30:00Z"); // 21:30 del 15/08 en Chile
    expect(orden >= new Date(inicioDelDia("2026-08-15"))).toBe(true);
    expect(orden <= new Date(finDelDia("2026-08-15"))).toBe(true);
  });

  it("deja fuera lo que ya pertenece al día siguiente en Chile", () => {
    const orden = new Date("2026-08-16T05:00:00Z"); // 01:00 del 16/08 en Chile
    expect(orden <= new Date(finDelDia("2026-08-15"))).toBe(false);
  });

  it("incluye una orden del primer minuto del día chileno", () => {
    const orden = new Date("2026-08-15T04:00:00Z"); // 00:00 del 15/08 en Chile
    expect(orden >= new Date(inicioDelDia("2026-08-15"))).toBe(true);
  });
});

describe("restarDias", () => {
  it("resta días sin cruzarse de fecha", () => {
    expect(restarDias("2026-08-15", 7)).toBe("2026-08-08");
    expect(restarDias("2026-08-15", 30)).toBe("2026-07-16");
  });

  it("cruza bien el cambio de mes y de año", () => {
    expect(restarDias("2026-03-01", 1)).toBe("2026-02-28");
    expect(restarDias("2026-01-01", 1)).toBe("2025-12-31");
  });
});

describe("grilla del calendario mensual", () => {
  it("octubre de 2026 parte en jueves y ocupa cinco semanas", () => {
    const semanas = semanasDelMes("2026-10");
    expect(semanas).toHaveLength(5);
    // Lunes, martes y miércoles de la primera semana son del mes anterior.
    expect(semanas[0].slice(0, 3)).toEqual([null, null, null]);
    expect(semanas[0][3]).toBe("2026-10-01");
    expect(semanas[4][5]).toBe("2026-10-31");
    expect(semanas[4][6]).toBeNull();
  });

  it("no pierde ni repite ningún día del mes", () => {
    const dias = semanasDelMes("2026-02").flat().filter(Boolean);
    expect(dias).toHaveLength(28);
    expect(new Set(dias).size).toBe(28);
    expect(dias[0]).toBe("2026-02-01");
  });

  it("un mes que empieza lunes no lleva relleno adelante", () => {
    // 1 de junio de 2026 es lunes.
    expect(semanasDelMes("2026-06")[0][0]).toBe("2026-06-01");
  });
});

describe("mes vecino", () => {
  it("cruza el cambio de año en los dos sentidos", () => {
    expect(mesDesplazado("2026-12", 1)).toBe("2027-01");
    expect(mesDesplazado("2026-01", -1)).toBe("2025-12");
  });
});

describe("días que ocupa un operativo", () => {
  it("un operativo de un día ocupa solo ese día", () => {
    expect(diasQueOcupa("2026-10-03", null)).toEqual(["2026-10-03"]);
  });

  it("un operativo de fin de semana ocupa sábado y domingo", () => {
    expect(diasQueOcupa("2026-10-03", "2026-10-04")).toEqual(["2026-10-03", "2026-10-04"]);
  });

  it("ignora una fecha de término anterior al inicio en vez de devolver nada", () => {
    expect(diasQueOcupa("2026-10-03", "2026-09-30")).toEqual(["2026-10-03"]);
  });
});

describe("horario del operativo", () => {
  it("muestra el rango sin segundos", () => {
    expect(rangoHorario("10:00:00", "13:00:00")).toBe("10:00 a 13:00");
  });

  it("aguanta que falte una de las dos horas", () => {
    expect(rangoHorario("16:00:00", null)).toBe("desde las 16:00");
    expect(rangoHorario(null, "18:00:00")).toBe("hasta las 18:00");
    expect(rangoHorario(null, null)).toBeNull();
  });
});

describe("cuándo toca volver a un lugar", () => {
  it("suma los meses de la cadencia", () => {
    expect(sumarMeses("2026-09-05", 6)).toBe("2027-03-05");
    expect(sumarMeses("2026-09-05", 12)).toBe("2027-09-05");
  });

  it("no se pasa de mes cuando el día no existe en el destino", () => {
    // 31 de agosto + 6 meses cae en febrero, que no tiene 31.
    expect(sumarMeses("2026-08-31", 6)).toBe("2027-02-28");
    expect(sumarMeses("2026-08-31", 18)).toBe("2028-02-29");
  });
});

describe("hace cuánto fue", () => {
  it("cuenta meses completos, no meses de calendario", () => {
    // Del 5 al 3 del mes siguiente todavía no es un mes.
    expect(haceCuanto("2026-09-05", "2026-10-03")).toBe("hace 4 semanas");
    expect(haceCuanto("2026-09-05", "2026-10-05")).toBe("hace 1 mes");
    expect(haceCuanto("2026-09-05", "2027-03-05")).toBe("hace 6 meses");
  });

  it("pasa a años cuando corresponde", () => {
    expect(haceCuanto("2026-09-05", "2027-09-05")).toBe("hace 1 año");
    expect(haceCuanto("2026-09-05", "2027-11-05")).toBe("hace 1 año y 2 meses");
    expect(haceCuanto("2024-09-05", "2026-09-05")).toBe("hace 2 años");
  });

  it("los primeros días se dicen en días y semanas", () => {
    expect(haceCuanto("2026-09-10", "2026-09-10")).toBe("hoy");
    expect(haceCuanto("2026-09-09", "2026-09-10")).toBe("hace 1 día");
    expect(haceCuanto("2026-09-01", "2026-09-10")).toBe("hace 1 semana");
  });
});

describe("día de la semana para el aviso de entrega", () => {
  it("dice el día en español", () => {
    // 12/09/2026 es sábado.
    expect(diaDeLaSemana("2026-09-12")).toBe("sábado");
    expect(diaDeLaSemana("2026-09-13")).toBe("domingo");
  });

  it("fechaConDia junta fecha y día en un solo texto", () => {
    expect(fechaConDia("2026-09-12")).toBe("12-09-2026 (sábado)");
  });
});
