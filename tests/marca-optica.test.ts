import { expect, it } from "vitest";
import { agregarTarjetaGlobal, esOpticaGlobal, MARCA_GLOBAL } from "../src/lib/marca-optica";
import { linkWhatsapp } from "../src/lib/whatsapp";
it("solo identifica a Óptica Global, sin aplicar su marca a otras ópticas", () => {
 expect(esOpticaGlobal("  Óptica Global ")).toBe(true);
 expect(esOpticaGlobal("Optica Global")).toBe(true);
 expect(esOpticaGlobal("Otra Óptica")).toBe(false);
 expect(esOpticaGlobal("Óptica Global otra sucursal")).toBe(false);
});
it("agrega una única tarjeta sin modificar el aviso personalizado", () => {
 const aviso = "Hola Ana, sus lentes están listos.\nRetiro: 10:00 a 13:00.\nSaldo: $0";
 const texto = agregarTarjetaGlobal(aviso);
 expect(texto).toBe(`${MARCA_GLOBAL.url}\n\n${aviso}`);
 expect(agregarTarjetaGlobal(texto)).toBe(texto);
 expect(new URL(MARCA_GLOBAL.url).search).toBe("");
});
it("conserva el destinatario y la apertura en WhatsApp Business con la tarjeta", () => {
 const texto = agregarTarjetaGlobal("Hola Ana");
 const link = linkWhatsapp("business", "56912345678", texto);
 expect(link).toContain("phone=56912345678");
 expect(link).toContain("package=com.whatsapp.w4b");
 expect(link).toContain(encodeURIComponent(texto));
});
