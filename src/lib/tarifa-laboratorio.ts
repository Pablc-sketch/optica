// Costo de un par de cristales según la tarifa que la óptica cargó para su
// laboratorio (tabla tarifas_laboratorio). Es lo que usan las ópticas que
// no trabajan con la lista compartida.
//
//   costo del par = (costo × 2 si la tarifa es por unidad, o costo si es
//                    por par) + montaje si se cobra aparte,
//                    y × 1,19 si la tarifa no incluye IVA.
export const IVA_CHILE = 1.19;

export type TarifaLaboratorio = {
  proveedor_id: string;
  tipo_lente: string;
  tratamiento: string;
  rango_receta: string | null;
  costo: number;
  unidad: "unidad" | "par";
  montaje: "incluido" | "aparte" | "no_aplica";
  montaje_costo: number;
  iva: "incluido" | "mas_iva";
  activo?: boolean;
};

export function costoParDeTarifa(t: TarifaLaboratorio): number {
  const cristales = t.unidad === "unidad" ? t.costo * 2 : t.costo;
  const neto = cristales + (t.montaje === "aparte" ? t.montaje_costo : 0);
  return t.iva === "mas_iva" ? Math.round(neto * IVA_CHILE) : neto;
}

const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// La tarifa que corresponde: primero la del rango exacto, si no la que vale
// para cualquier rango; y del laboratorio elegido, si se eligió uno.
export function elegirTarifa(
  tarifas: TarifaLaboratorio[],
  tipoLente: string,
  tratamiento: string,
  rango: string,
  proveedorId?: string | null
): TarifaLaboratorio | null {
  const candidatas = tarifas.filter(
    (t) => t.activo !== false && igual(t.tipo_lente, tipoLente) && igual(t.tratamiento, tratamiento)
      && (t.rango_receta === null || t.rango_receta === rango)
      && (!proveedorId || t.proveedor_id === proveedorId)
  );
  return candidatas.find((t) => t.rango_receta === rango) ?? candidatas.find((t) => t.rango_receta === null) ?? null;
}
