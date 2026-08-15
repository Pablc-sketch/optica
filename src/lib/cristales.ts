// La plantilla de costos mezcla dos cosas dentro del campo "tratamiento":
// tratamientos/materiales de verdad (Orgánico Antirreflejo, Policarbonato
// Filtro Azul, Fotocromático…) y nombres que en realidad describen otro
// tipo de lente (Bifocal Antirreflejo, Multifocal Filtro Azul). Por eso al
// elegir "Monofocal" aparecían opciones como "Multifocal Antirreflejo",
// que no existen como producto.
//
// Se filtra en la aplicación y no borrando filas: cada óptica ya editó sus
// precios sobre esas filas, y un borrado se llevaría ese trabajo puesto.

const TIPOS_DE_LENTE = ["Bifocal", "Multifocal"] as const;

// Un tratamiento cuyo nombre empieza con un tipo de lente solo corresponde
// a ese tipo. El resto (orgánico, policarbonato, fotocromático, polarizado)
// son materiales/tratamientos que aplican a cualquier lente.
export function tratamientoAplica(tipoLente: string, tratamiento: string): boolean {
  const tipoEnNombre = TIPOS_DE_LENTE.find((t) => tratamiento.startsWith(t));
  if (!tipoEnNombre) return true;
  return tipoEnNombre === tipoLente;
}

// Nombre completo para mostrar: "Monofocal Orgánico Antirreflejo". Si el
// tratamiento ya empieza con el tipo de lente no se repite.
export function nombreCristal(tipoLente: string, tratamiento: string): string {
  return tratamiento.startsWith(tipoLente) ? tratamiento : `${tipoLente} ${tratamiento}`;
}
