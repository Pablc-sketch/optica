import { describe, expect, it } from "vitest";
import {
  desfaseChile,
  diaEnChile,
  finDelDia,
  inicioDelDia,
  restarDias,
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
