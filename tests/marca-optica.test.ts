import { expect, it } from "vitest";
import { esOpticaGlobal, MARCA_GLOBAL } from "../src/lib/marca-optica";
import { linkWhatsapp } from "../src/lib/whatsapp";
it("solo identifica a Óptica Global, sin aplicar su marca a otras ópticas", () => {
 expect(esOpticaGlobal("  Óptica Global ")).toBe(true);
 expect(esOpticaGlobal("Optica Global")).toBe(true);
 expect(esOpticaGlobal("Otra Óptica")).toBe(false);
 expect(esOpticaGlobal("Óptica Global otra sucursal")).toBe(false);
});
it("conserva el destinatario y la apertura en WhatsApp Business con texto sin enlace de marca", () => {
 const texto = "Hola Ana, sus lentes están listos. Retiro: viernes, 10:00 a 12:00.";
 const link = linkWhatsapp("business", "56912345678", texto);
 expect(link).toContain("phone=56912345678");
 expect(link).toContain("package=com.whatsapp.w4b");
 expect(link).toContain(encodeURIComponent(texto));
 expect(decodeURIComponent(link)).not.toContain(MARCA_GLOBAL.url);
});
