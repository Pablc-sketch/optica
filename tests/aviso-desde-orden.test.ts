import { expect, it } from "vitest";
import { rutaAvisoEntrega } from "../src/lib/avisos";
it("lleva al mismo editor de entrega con el operativo y la persona de la orden", () => {
 const ruta = rutaAvisoEntrega("operativo-1", "paciente-2");
 expect(ruta).toBe("/avisos?op=operativo-1&paciente=paciente-2");
});
it("no elige un operativo ajeno para órdenes sin operativo", () => {
 expect(rutaAvisoEntrega(null, "paciente-2")).toBeNull();
 expect(rutaAvisoEntrega(undefined)).toBeNull();
});
it("permite abrir todos los avisos de un operativo sin filtro", () => {
 expect(rutaAvisoEntrega("operativo-1")).toBe("/avisos?op=operativo-1");
});
