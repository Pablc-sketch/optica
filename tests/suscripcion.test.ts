import { describe, expect, it } from "vitest";
import { diasRestantes, estaVigente, type Suscripcion } from "../src/lib/suscripcion";

const sus = (fecha_renovacion: string, estado = "activa"): Suscripcion => ({
  plan: "basico",
  estado,
  fecha_inicio: "2026-09-01",
  fecha_renovacion,
  medio_pago: null,
});

describe("suscripción en fecha civil de Chile (A13)", () => {
  it("el día de la renovación todavía es vigente; el día siguiente no", () => {
    expect(estaVigente(sus("2026-10-01"), "2026-10-01")).toBe(true);
    // El caso de la auditoría: 2026-10-02T12:00Z = 02/10 en Chile.
    expect(estaVigente(sus("2026-10-01"), "2026-10-02")).toBe(false);
  });

  it("cuenta días civiles, no horas", () => {
    expect(diasRestantes("2026-10-08", "2026-10-01")).toBe(7);
    expect(diasRestantes("2026-10-01", "2026-10-01")).toBe(0);
    expect(diasRestantes("2026-09-30", "2026-10-01")).toBe(-1);
  });

  it("solo trial y activa habilitan, como en la base", () => {
    expect(estaVigente(sus("2026-12-01", "cancelada"), "2026-10-01")).toBe(false);
    expect(estaVigente(sus("2026-12-01", "vencida"), "2026-10-01")).toBe(false);
    expect(estaVigente(sus("2026-12-01", "trial"), "2026-10-01")).toBe(true);
  });
});
