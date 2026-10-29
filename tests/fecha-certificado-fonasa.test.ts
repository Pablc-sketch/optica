import { expect, it } from "vitest";
import { fechaCertificadoFonasa } from "../src/lib/fecha-certificado-fonasa";
it("actualiza el certificado al último abono corregido al 29 de octubre", () => {
 expect(fechaCertificadoFonasa("2026-09-20T15:00:00Z", [
 { fecha: "2026-10-29T15:00:00Z", monto: 20000 },
 { fecha: "2026-09-20T15:00:00Z", monto: 10000 },
 ])).toBe("2026-10-29");
});
it("respeta el día chileno y descarta pagos sin monto", () => {
 expect(fechaCertificadoFonasa("2026-09-20T15:00:00Z", [
 { fecha: "2026-10-30T01:00:00Z", monto: 20000 },
 { fecha: "2026-11-30T15:00:00Z", monto: 0 },
 ])).toBe("2026-10-29");
});
it("conserva la fecha de compra cuando no hay abonos", () => {
 expect(fechaCertificadoFonasa("2026-09-20T15:00:00Z", [])).toBe("2026-09-20");
});
