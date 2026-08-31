// Nombre completo para mostrar: "Monofocal Orgánico Antirreflejo". Si el
// tratamiento ya empieza con el tipo de lente no se repite.
export function nombreCristal(tipoLente: string, tratamiento: string): string {
  return tratamiento.startsWith(tipoLente) ? tratamiento : `${tipoLente} ${tratamiento}`;
}
