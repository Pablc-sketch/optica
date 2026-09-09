// Cómo se reparte la plata de un operativo entre quienes trabajan en él:
//
//   1. Isadora (vendedora) se lleva una comisión — hoy el 10% de lo
//      vendido (puede cambiarse a % de la utilidad, es cambiable por
//      operativo).
//   2. De lo que queda, se aparta un % para ahorro: comprar equipos,
//      arriendo, hospedaje, imprevistos — caja chica del negocio, no de
//      ninguna persona.
//   3. Lo que sobra se divide en dos: mitad para la mamá (representante
//      legal, también vende), mitad para Pablo (tecnólogo, refracta y
//      sugiere el lente). Ninguno de los dos tiene comisión aparte — su
//      pago ES esa mitad.
//
// Los porcentajes viven en cada operativo (no en un ajuste global), así
// que un cambio de criterio hacia adelante no recalcula solo lo ya
// repartido en operativos anteriores.
export type BaseComision = "venta_total" | "utilidad_neta";

export type ParametrosSueldo = {
  comisionVendedoraPct: number;
  comisionVendedoraBase: BaseComision;
  ahorroPct: number;
};

export type DesgloseSueldo = {
  ventaTotal: number;
  utilidadNeta: number;
  comisionIsadora: number;
  // utilidadNeta - comisionIsadora. Puede ser negativo si el operativo dio
  // pérdida y aun así hay que pagarle la comisión a Isadora por vender.
  utilidadDisponible: number;
  ahorro: number;
  // Nunca negativo: si la utilidad disponible no alcanza, no se le "cobra"
  // la diferencia a la mamá ni a Pablo.
  restoParaDividir: number;
  parteMadre: number;
  partePablo: number;
};

export function calcularSueldos(
  ventaTotal: number,
  utilidadNeta: number,
  parametros: ParametrosSueldo
): DesgloseSueldo {
  const base = parametros.comisionVendedoraBase === "venta_total" ? ventaTotal : utilidadNeta;
  // Si la base es "utilidad_neta" y el operativo dio pérdida, no hay de
  // dónde sacar comisión — se pone en 0 en vez de una comisión negativa.
  const comisionIsadora = Math.round(Math.max(0, base) * (parametros.comisionVendedoraPct / 100));
  const utilidadDisponible = utilidadNeta - comisionIsadora;
  const ahorro = utilidadDisponible > 0 ? Math.round(utilidadDisponible * (parametros.ahorroPct / 100)) : 0;
  const restoParaDividir = Math.max(0, utilidadDisponible - ahorro);
  // parteMadre se redondea y partePablo se calcula por diferencia (no los
  // dos por separado) para que la suma de las dos partes cuadre siempre
  // con restoParaDividir, sin perder ni ganar un peso por el redondeo.
  const parteMadre = Math.round(restoParaDividir / 2);
  const partePablo = restoParaDividir - parteMadre;
  return {
    ventaTotal,
    utilidadNeta,
    comisionIsadora,
    utilidadDisponible,
    ahorro,
    restoParaDividir,
    parteMadre,
    partePablo,
  };
}

// Suma un conjunto de desgloses (ej. todos los operativos de un mes) en
// uno solo, para el total mensual de cada persona — los sueldos son
// mensuales, así que un mes con más operativos deja más plata, y el mes
// siguiente se vuelve a partir de cero.
export function sumarDesgloses(desgloses: DesgloseSueldo[]): DesgloseSueldo {
  return desgloses.reduce(
    (acc, d) => ({
      ventaTotal: acc.ventaTotal + d.ventaTotal,
      utilidadNeta: acc.utilidadNeta + d.utilidadNeta,
      comisionIsadora: acc.comisionIsadora + d.comisionIsadora,
      utilidadDisponible: acc.utilidadDisponible + d.utilidadDisponible,
      ahorro: acc.ahorro + d.ahorro,
      restoParaDividir: acc.restoParaDividir + d.restoParaDividir,
      parteMadre: acc.parteMadre + d.parteMadre,
      partePablo: acc.partePablo + d.partePablo,
    }),
    {
      ventaTotal: 0,
      utilidadNeta: 0,
      comisionIsadora: 0,
      utilidadDisponible: 0,
      ahorro: 0,
      restoParaDividir: 0,
      parteMadre: 0,
      partePablo: 0,
    }
  );
}
