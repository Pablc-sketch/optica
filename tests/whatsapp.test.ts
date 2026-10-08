import { describe, expect, it } from "vitest";
import { linkWhatsapp, normalizarParaWhatsapp } from "../src/lib/whatsapp";

describe("normalizarParaWhatsapp", () => {
  it("deja tildes y ñ, y quita todos los emojis", () => {
    expect(normalizarParaWhatsapp("Hola 👋 Miércoles — ñandú 📅")).toBe("Hola Miércoles - ñandú");
  });
  it("cambia comillas y viñetas raras por las de teclado", () => {
    expect(normalizarParaWhatsapp("“listo” • ok…")).toBe('"listo" - ok...');
  });
});

describe("linkWhatsapp", () => {
  it("arma el link según la app elegida", () => {
    expect(linkWhatsapp("auto", "56912345678", "Hola")).toBe("https://wa.me/56912345678?text=Hola");
    expect(linkWhatsapp("web", "56912345678", "Hola")).toBe("https://web.whatsapp.com/send?phone=56912345678&text=Hola");
    expect(linkWhatsapp("business", "56912345678", "Hola")).toContain("package=com.whatsapp.w4b");
  });
});
