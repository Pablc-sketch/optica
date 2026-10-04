// Pares sugeridos en la receta más allá de los dos de siempre (columna
// recetas.sugerencias_extra). Ej.: además del multifocal, un polarizado de
// sol y un monofocal de cerca.
export type SugerenciaExtra = {
  tipo_lente: string;
  tratamiento: string;
  posicion: "lejos" | "cerca" | null;
};

// Lo que viene de la base o del formulario, validado: lo que no calza se
// descarta en vez de romper la pantalla.
export function leerSugerenciasExtra(valor: unknown): SugerenciaExtra[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .filter(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && typeof v.tipo_lente === "string" && typeof v.tratamiento === "string"
    )
    .filter((v) => v.tipo_lente !== "" && v.tratamiento !== "")
    .map((v) => ({
      tipo_lente: v.tipo_lente as string,
      tratamiento: v.tratamiento as string,
      posicion: (v.posicion === "lejos" || v.posicion === "cerca" ? v.posicion : null) as SugerenciaExtra["posicion"],
    }))
    .slice(0, 4);
}
