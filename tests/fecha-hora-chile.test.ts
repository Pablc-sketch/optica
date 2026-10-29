import { describe, expect, it } from "vitest";
import { instanteChile, fechaHoraChile } from "../src/lib/fecha-hora-chile";
describe("Corrección de fechas en Santiago", () => {
 it("convierte verano e invierno sin depender de la zona del servidor", () => {
 expect(instanteChile("2026-10-29T10:15")).toBe("2026-10-29T13:15:00.000Z");
 expect(instanteChile("2026-07-29T10:15")).toBe("2026-07-29T14:15:00.000Z");
 });
 it("conserva el día local al cruzar medianoche UTC", () => {
 expect(fechaHoraChile("2026-10-30T01:15:00Z")).toBe("2026-10-29T22:15");
 });
 it("rechaza fechas inexistentes o sin hora", () => {
 expect(() => instanteChile("2026-02-30T10:00")).toThrow();
 expect(() => instanteChile("2026-10-29")).toThrow();
 });
});
