import { expect, it } from "vitest";
import { descripcionLenteDocumento } from "../src/lib/descripcion-lente-documento";
it("presenta las dos distancias sin cambiar cantidades", () => {
 expect(descripcionLenteDocumento("2 lentes Multifocales AR")).toBe("2 lentes lejos y cerca AR");
 expect(descripcionLenteDocumento("Multifocal" )).toBe("lejos y cerca");
 expect(descripcionLenteDocumento("Monofocal cerca")).toBe("Monofocal cerca");
});
