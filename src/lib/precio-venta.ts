// Cuánto se le cobra al paciente por un par de cristales, y de dónde sale.
//
// Esto vivía repetido en tres pantallas — el cotizador de la receta (donde
// atiende el tecnólogo), el punto de venta (donde cierra la vendedora) y la
// cotización por WhatsApp de cada operativo — y cada copia hacía el
// cálculo un poco distinto. El cotizador de la receta, por ejemplo, mostraba
// siempre el precio de laboratorio: un Monofocal Antirreflejo básico salía
// $55.000 cuando el tecnólogo lo cotizaba y $38.000 cuando la vendedora lo
// cobraba. Ahora las tres pantallas llaman a estas mismas funciones.
//
// Las reglas, tal como las pidió la óptica:
//   1. Siempre se intenta pedirlo hecho (stock): es lo más barato para la
//      óptica. Se manda a tallar solo cuando el laboratorio no lo tiene.
//   2. Monofocal: si sale de stock, se cobra el precio de stock (más
//      barato para el paciente). Si hay que tallarlo, el de laboratorio.
//   3. Bifocal y Multifocal: SIEMPRE el mismo precio, salga de donde salga.
//      Si el laboratorio lo tiene hecho, la diferencia de costo queda para
//      la óptica — no se le baja el precio al paciente.

import { costoCristal, type CatalogoLaboratorio, type CostoCristal, type MapaCristal, type Ojo } from "./costo-fides";
import { limitesDeRango } from "./cristales";

// Una fila del catálogo de /precios (costos_cristales): el precio de venta
// más el puente hacia la lista del laboratorio.
export type FilaCristal = MapaCristal & {
  rango_receta: string;
  tratamiento: string;
  costo: number;
  precio_venta: number;
  precio_venta_stock: number | null;
};

// Las potencias de la receta que importan para el cristal.
export type PotenciasReceta = {
  od_esfera: number | null;
  od_cilindro: number | null;
  od_add: number | null;
  oi_esfera: number | null;
  oi_cilindro: number | null;
  oi_add: number | null;
};

// Con qué potencia se talla cada ojo. Un Monofocal de cerca (lectura)
// lleva la adición sumada a la esfera — es la potencia real del cristal.
// Un Bifocal/Multifocal NO la suma (el cristal trae las dos distancias),
// pero la lleva aparte: decide si cae en la caja de stock.
export function ojosParaCristal(
  receta: PotenciasReceta,
  tipoLente: string,
  posicion: "lejos" | "cerca" | null | undefined
): Ojo[] {
  const sumarAdd = tipoLente === "Monofocal" && posicion === "cerca";
  const ojo = (esfera: number | null, cilindro: number | null, add: number | null): Ojo => ({
    esfera: (esfera ?? 0) + (sumarAdd ? (add ?? 0) : 0),
    cilindro,
    add,
  });
  return [
    ojo(receta.od_esfera, receta.od_cilindro, receta.od_add),
    ojo(receta.oi_esfera, receta.oi_cilindro, receta.oi_add),
  ];
}

// Costo real y origen (stock o laboratorio) de este cristal.
//
// Con receta, se calcula ojo por ojo contra la lista del laboratorio. Sin
// receta guardada (operativo: se refracta y se vende en el momento) se
// prueba el PEOR CASO del rango elegido: si el laboratorio lo tiene hecho
// incluso en el tope de ese casillero, también lo va a tener para la
// receta real, que como mucho llega a ese tope.
export function costoRealCristal(
  fila: FilaCristal,
  receta: PotenciasReceta | null | undefined,
  posicion: "lejos" | "cerca" | null | undefined,
  catalogo: CatalogoLaboratorio,
  hoy: string
): CostoCristal | null {
  if (receta) return costoCristal(fila, ojosParaCristal(receta, fila.tipo_lente, posicion), catalogo, hoy);
  const limites = limitesDeRango(fila.rango_receta);
  if (!limites) return null;
  // Sin receta no se sabe el signo de la esfera, ni si trae cilindro, ni la
  // adición: el peor caso es el tope con cilindro, que nunca cae en la caja
  // de stock de un bifocal/multifocal — ahí se cotiza tallado, a propósito.
  const tope: Ojo = { esfera: limites.esfera, cilindro: limites.cilindro, add: null };
  return costoCristal(fila, [tope, tope], catalogo, hoy);
}

export function origenCristal(
  fila: FilaCristal,
  receta: PotenciasReceta | null | undefined,
  posicion: "lejos" | "cerca" | null | undefined,
  catalogo: CatalogoLaboratorio,
  hoy: string
): "stock" | "laboratorio" {
  return costoRealCristal(fila, receta, posicion, catalogo, hoy)?.origen ?? "laboratorio";
}

// El precio al que se le vende al paciente, según de dónde sale.
// factorVenta es solo el respaldo para una fila que todavía no tiene
// precio fijado en /precios.
export function precioVentaCristal(
  fila: Pick<FilaCristal, "tipo_lente" | "costo" | "precio_venta" | "precio_venta_stock">,
  origen: "stock" | "laboratorio",
  factorVenta = 0
): number {
  if (
    fila.tipo_lente === "Monofocal" &&
    origen === "stock" &&
    fila.precio_venta_stock !== null &&
    fila.precio_venta_stock > 0
  ) {
    return fila.precio_venta_stock;
  }
  return fila.precio_venta > 0 ? fila.precio_venta : Math.round(fila.costo * factorVenta);
}
