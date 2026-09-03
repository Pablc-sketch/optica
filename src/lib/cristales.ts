// Nombre completo para mostrar: "Monofocal Orgánico Antirreflejo". Si el
// tratamiento ya empieza con el tipo de lente no se repite.
export function nombreCristal(tipoLente: string, tratamiento: string): string {
  return tratamiento.startsWith(tipoLente) ? tratamiento : `${tipoLente} ${tratamiento}`;
}

// Bandas de costo por exigencia de la receta ("±X.00 / ±Y.00" = esfera
// máxima / cilindro máximo), en el mismo orden en que se cargaron en
// costos_cristales — de menor a mayor, cada una incluye a la anterior.
const BANDAS_RANGO = [
  { esfera: 2, cilindro: 2, rango: "±2.00 / ±2.00" },
  { esfera: 4, cilindro: 2, rango: "±4.00 / ±2.00" },
  { esfera: 4, cilindro: 4, rango: "±4.00 / ±4.00" },
  { esfera: 6, cilindro: 4, rango: "±6.00 / ±4.00" },
  { esfera: 6, cilindro: 6, rango: "±6.00 / ±6.00" },
] as const;

// La vendedora no tiene que saber de dioptrías: el sistema mira la esfera
// y el cilindro más exigentes entre los dos ojos (el laboratorio cobra
// según el peor caso, no un ojo cualquiera) y elige sola la fila de costo
// que corresponde. Si la receta se sale de todos los rangos cargados, se
// usa el más alto disponible — mejor eso que dejar la venta sin precio.
export function clasificarRango(esferas: (number | null)[], cilindros: (number | null)[]): string {
  const esferaMax = Math.max(0, ...esferas.map((e) => Math.abs(e ?? 0)));
  const cilindroMax = Math.max(0, ...cilindros.map((c) => Math.abs(c ?? 0)));
  const banda = BANDAS_RANGO.find((b) => esferaMax <= b.esfera && cilindroMax <= b.cilindro);
  return (banda ?? BANDAS_RANGO[BANDAS_RANGO.length - 1]).rango;
}

// Para un Monofocal de cerca (lectura) la potencia real del cristal es la
// esfera de lejos MÁS la adición (ADD) — un +1.00 de hipermetropía con
// ADD +2.00 arma un lente de +3.00, que puede caer en un rango de costo más
// alto que el de lejos. El cilindro no cambia con la adición. Para "lejos"
// (o cuando no hay adición) es lo mismo que clasificarRango de toda la vida.
export function rangoParaPosicion(
  esferas: (number | null)[],
  cilindros: (number | null)[],
  adds: (number | null)[],
  posicion: "lejos" | "cerca"
): string {
  if (posicion === "lejos") return clasificarRango(esferas, cilindros);
  const esferasEfectivas = esferas.map((e, i) => (e === null ? null : e + (adds[i] ?? 0)));
  return clasificarRango(esferasEfectivas, cilindros);
}
