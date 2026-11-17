import { describe, expect, it } from "vitest";
import { comoLlegar, mapaUbicacion, rutaDelDia, textoUbicacion } from "@/lib/mapas";
import { menuParaRol } from "@/lib/navegacion";

describe("ubicaciones del calendario", () => {
  it("busca comuna o dirección en Chile y codifica caracteres especiales como datos", () => {
    const lugar = { direccion: "Av. O'Higgins 100 & 102", comuna: "Ñuñoa", region: "Metropolitana" };
    const url = new URL(mapaUbicacion(lugar)!);
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("query")).toBe("Av. O'Higgins 100 & 102, Ñuñoa, Metropolitana, Chile");
    expect(new URL(comoLlegar({ comuna: "Quilicura" })!).searchParams.get("destination")).toBe("Quilicura, Chile");
    expect(textoUbicacion({ direccion: "Quilicura", comuna: "Quilicura" })).toBe("Quilicura");
    expect(mapaUbicacion({})).toBeNull();
  });
  it("conserva las tres sedes en el orden recibido para abrir la ruta", () => {
    const ruta = new URL(rutaDelDia([{ direccion: "Mañana", comuna: "Lo Prado" }, { direccion: "Mediodía", comuna: "Quilicura" }, { direccion: "Tarde", comuna: "Renca" }])!);
    expect(ruta.searchParams.get("origin")).toBe("Mañana, Lo Prado, Chile");
    expect(ruta.searchParams.get("waypoints")).toBe("Mediodía, Quilicura, Chile");
    expect(ruta.searchParams.get("destination")).toBe("Tarde, Renca, Chile");
  });
  it("no ofrece una ruta incompleta si falta una ubicación o supera los límites móviles", () => {
    expect(rutaDelDia([{ comuna: "Lo Prado" }, {}])).toBeNull();
    expect(rutaDelDia([{ comuna: "Lo Prado" }])).toBeNull();
    expect(rutaDelDia(Array.from({ length: 6 }, () => ({ comuna: "Quilicura" })))).toBeNull();
  });
  it("da acceso al calendario a ventas y conserva las restricciones de otros roles", () => {
    expect(menuParaRol("ventas", false).find(n => n.href === "/operativos/agenda")?.movil).toBe(true);
    expect(menuParaRol("clinico", false).some(n => n.href === "/operativos/agenda")).toBe(false);
  });
});
