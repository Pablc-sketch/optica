import { formatearRut } from "./rut";

// Solo texto literal: no aceptar comodines ni sintaxis de filtros PostgREST.
export function prepararBusquedaSeguro(entrada: unknown): { campo: "nombre" | "rut"; patrones: string[] } | null {
  if (typeof entrada !== "string") return null;
  const texto = entrada.trim().replace(/\s+/g, " ");
  if (texto.length < 3 || texto.length > 80) return null;
  if (/^[0-9.kK\s-]+$/.test(texto)) {
    const rut = texto.replace(/[^0-9kK]/g, "").toUpperCase();
    if (rut.length < 7 || rut.length > 9) return null;
    return { campo: "rut", patrones: [...new Set([rut, formatearRut(rut), `${rut.slice(0, -1)}-${rut.slice(-1)}`])] };
  }
  if (!/^[\p{L}\p{M}\s'’-]+$/u.test(texto)) return null;
  return { campo: "nombre", patrones: [`%${texto}%`] };
}
