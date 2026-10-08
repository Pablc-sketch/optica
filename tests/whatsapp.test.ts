import { describe, expect, it } from "vitest";
import { linkWhatsapp, normalizarParaWhatsapp } from "../src/lib/whatsapp";

describe("normalizarParaWhatsapp", () => {
  it("deja tildes, ñ y los emojis seguros", () => {
    expect(normalizarParaWhatsapp("📅 *Miércoles* — año ñandú 👓")).toBe("📅 *Miércoles* - año ñandú 👓");
  });
  it("quita emojis compuestos y símbolos raros", () => {
    expect(normalizarParaWhatsapp("Hola 👨‍👩‍👧 ✨ “listo” • ok…")).toBe('Hola   "listo" - ok...');
  });
  it("quita el selector de variación que algunos teléfonos muestran como cuadrito", () => {
    expect(normalizarParaWhatsapp("⏰️ hora")).toBe("⏰ hora");
  });
});

describe("linkWhatsapp", () => {
  it("arma el link según la app elegida", () => {
    expect(linkWhatsapp("auto", "56912345678", "Hola")).toBe("https://wa.me/56912345678?text=Hola");
    expect(linkWhatsapp("web", "56912345678", "Hola")).toBe("https://web.whatsapp.com/send?phone=56912345678&text=Hola");
    expect(linkWhatsapp("business", "56912345678", "Hola")).toContain("package=com.whatsapp.w4b");
  });
});
