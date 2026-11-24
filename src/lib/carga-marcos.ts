import { claveCodigoMarco } from "./buscar-producto";

export type ModoCargaMarcos = "entrada" | "conteo";
export type FilaCargaMarcos = { codigo: string; cantidad: number };

export function leerCargaMarcos(texto: string, modo: ModoCargaMarcos): { filas: FilaCargaMarcos[]; error?: string } {
  const filas = new Map<string, FilaCargaMarcos>();
  const lineas = texto.split(/\r?\n/);
  if (texto.length > 30_000 || lineas.length > 250) return { filas: [], error: "Usa un máximo de 250 líneas por carga." };

  for (const [i, linea] of lineas.entries()) {
    if (!linea.trim()) continue;
    const columnas = linea.split(/[;\t,]/).map(x => x.trim());
    const codigo = columnas[0].replace(/\s+/g, " ").toUpperCase();
    const clave = claveCodigoMarco(codigo);
    if (columnas.length > 2 || !clave || codigo.length > 80 || !/^[A-Z0-9 ._/#-]+$/.test(codigo)) {
      return { filas: [], error: `Línea ${i + 1}: revisa el código de la etiqueta.` };
    }
    const valor = columnas[1] ?? (modo === "entrada" ? "1" : "");
    const cantidad = Number(valor);
    if (!/^\d{1,5}$/.test(valor) || (modo === "entrada" && cantidad < 1)) {
      return { filas: [], error: `Línea ${i + 1}: escribe una cantidad ${modo === "entrada" ? "mayor que cero" : "entera, también puede ser cero"}.` };
    }
    const anterior = filas.get(clave);
    if (anterior && modo === "conteo") {
      return { filas: [], error: `Línea ${i + 1}: ${codigo} ya está en este conteo. Escribe su cantidad total en una sola línea.` };
    }
    filas.set(clave, { codigo: anterior?.codigo ?? codigo, cantidad: (anterior?.cantidad ?? 0) + cantidad });
  }

  return { filas: [...filas.values()] };
}
