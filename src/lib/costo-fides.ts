// Cuánto nos cuesta de verdad un par de cristales, calculado contra la
// lista del laboratorio en vez de una cifra escrita a mano.
//
// La boleta real de Fides (nota de venta 53160) mostró tres cosas que la
// app tenía mal:
//
//   1. El precio se cobra POR OJO, no por par. En una receta despareja
//      (+2.25 -2.00 en un ojo, +2.00 -2.25 en el otro) un cristal salió
//      $670 y el otro $1.850 — la misma persona, dos precios.
//   2. El montaje no es un promedio: va de $2.000 (orgánico simple) a
//      $4.500 (multifocal cerrado) según el material y el diseño.
//   3. El laboratorio hace un descuento por cliente sobre TODO, cristales
//      y montaje incluidos.
//
// Con eso el cálculo reproduce la boleta al peso:
//   (cristal ojo derecho + cristal ojo izquierdo + montaje)
//     × (1 - descuento) × 1.19

export const IVA = 1.19;

export type PrecioStock = {
  material: string;
  diseno: string;
  esfera_max: number | null;
  cilindro_max: number | null;
  precio_unitario: number;
};

export type PrecioLaboratorio = {
  diseno: string;
  material: string;
  precio_unitario: number | null;
};

export type PrecioMontaje = {
  origen: string;
  material: string;
  diseno: string;
  precio: number;
};

export type PrecioRecargo = { categoria: string; concepto: string; precio: number };

// Un descuento del laboratorio sobre una parte de su lista, con fecha de
// término. material null = todos los materiales de ese diseño.
export type Promocion = {
  diseno: string;
  material: string | null;
  descuento_pct: number;
  desde: string;
  hasta: string;
  nota: string | null;
};

export type CatalogoLaboratorio = {
  stock: PrecioStock[];
  laboratorio: PrecioLaboratorio[];
  montaje: PrecioMontaje[];
  recargos: PrecioRecargo[];
  promociones: Promocion[];
  // Descuento que el laboratorio le hace a esta óptica, en porcentaje.
  descuentoPct: number;
};

// Cómo se llama este cristal en cada una de las dos listas del
// laboratorio. Vive en costos_cristales, editable desde /precios.
export type MapaCristal = {
  tipo_lente: string;
  material_stock: string | null;
  material_laboratorio: string | null;
  diseno_laboratorio: string | null;
  montaje_material: string | null;
  // El diseño que se va a empezar a pedir, y desde qué día. Sirve para
  // dejar programado un cambio que ya está decidido: mientras corre la
  // promoción de septiembre conviene pedir el MULTIFOCAL ADVANCE, y el 1
  // de octubre hay que volver al CONFORT. Dejarlo escrito acá evita tener
  // que acordarse ese día — y evita seguir pidiendo el caro por inercia.
  diseno_laboratorio_proximo?: string | null;
  diseno_proximo_desde?: string | null;
};

// Qué diseño corresponde pedir en una fecha dada.
export function disenoVigente(mapa: MapaCristal, hoy: string): string | null {
  if (mapa.diseno_laboratorio_proximo && mapa.diseno_proximo_desde && hoy >= mapa.diseno_proximo_desde) {
    return mapa.diseno_laboratorio_proximo;
  }
  return mapa.diseno_laboratorio;
}

// Un ojo. La esfera ya viene con la adición sumada cuando el cristal es
// de cerca — es la potencia con que se talla, y es la que cobra el
// laboratorio (la boleta lo confirma: una receta de +0.50 con ADD +2.50
// llegó a Fides como +3.00).
export type Ojo = { esfera: number | null; cilindro: number | null };

export type CostoCristal = {
  origen: "stock" | "laboratorio";
  // Cómo se pide en el catálogo del laboratorio. En los tallados a medida
  // es el diseño ("MULTIFOCAL ADVANCE") con su material; en los de stock,
  // el código del cristal hecho. Va impreso en la planilla del pedido.
  diseno: string | null;
  material: string | null;
  // Total del par: los dos cristales + montaje, con descuento e IVA.
  costo: number;
  // Lo que costaría sin la promoción vigente. Igual a costo cuando no hay
  // ninguna. Sirve para avisar antes de que se acabe, no para cobrar.
  costoSinPromocion: number;
  promocion: Promocion | null;
  // Desglose, para poder mostrarlo y cuadrarlo con la boleta.
  unitarios: number[];
  montaje: number;
  descuento: number;
  motivo: string;
};

function abs(v: number | null): number {
  return Math.abs(v ?? 0);
}

// El diseño con que el laboratorio agrupa el montaje y el stock de
// bifocales/multifocales. Los nombres internos de la óptica ("Bifocal
// Filtro Azul") empiezan por el tipo de lente.
function disenoBase(tipoLente: string): "MONOFOCAL" | "BIFOCAL" | "MULTIFOCAL" {
  if (tipoLente === "Bifocal") return "BIFOCAL";
  if (tipoLente === "Multifocal") return "MULTIFOCAL";
  return "MONOFOCAL";
}

// Precio de UN cristal ya hecho, para la potencia de ESE ojo.
//
// La lista de stock es una grilla de topes: una celda "4 / 2" cubre
// cualquier receta de hasta ±4.00 de esfera y ±2.00 de cilindro. Se toma
// la celda más barata de las que alcanzan a cubrir el ojo, que es lo que
// hace el laboratorio al despacharlo — por eso un cilindro -4.75 sin
// esfera sale por la columna de cilindro solo ($12.000) y no por la
// combinada más cara que nadie necesita.
export function precioStockOjo(
  material: string,
  ojo: Ojo,
  stock: PrecioStock[]
): number | null {
  const esfera = abs(ojo.esfera);
  const cilindro = abs(ojo.cilindro);
  const cubren = stock.filter(
    (s) =>
      s.material === material &&
      s.diseno === "MONOFOCAL" &&
      s.esfera_max !== null &&
      s.cilindro_max !== null &&
      s.esfera_max >= esfera &&
      s.cilindro_max >= cilindro
  );
  if (cubren.length === 0) return null;
  return Math.min(...cubren.map((s) => s.precio_unitario));
}

// Bifocales y multifocales de stock: el laboratorio no los tiene en una
// grilla de potencias sino en una caja aparte, con un rango fijo chico
// (neutros hasta ESF +3.00, ADD +1.00 hasta +3.00). Fuera de ahí los
// talla igual.
const TOPE_ESFERA_STOCK_MULTIFOCAL = 3;

export function precioStockMultifocalOjo(
  material: string,
  diseno: "BIFOCAL" | "MULTIFOCAL",
  ojo: Ojo,
  stock: PrecioStock[]
): number | null {
  if (abs(ojo.esfera) > TOPE_ESFERA_STOCK_MULTIFOCAL) return null;
  const fila = stock.find((s) => s.material === material && s.diseno === diseno);
  return fila?.precio_unitario ?? null;
}

// Lo que suma el laboratorio cuando la receta se sale de lo corriente
// (cilindro sobre ±4, esfera sobre ±10). Es por cristal, y solo en los
// tallados a medida: el precio de stock ya viene por potencia.
export function recargoOjo(ojo: Ojo, recargos: PrecioRecargo[]): number {
  const porCategoria = (categoria: string, valor: number) =>
    recargos
      .filter((r) => r.categoria === categoria)
      .map((r) => ({ ...r, umbral: Number(r.concepto.replace(/[^\d]/g, "")) }))
      .filter((r) => Number.isFinite(r.umbral) && valor > r.umbral)
      .sort((a, b) => b.umbral - a.umbral)[0]?.precio ?? 0;
  return porCategoria("cilindro", abs(ojo.cilindro)) + porCategoria("esfera", abs(ojo.esfera));
}

// La promoción vigente hoy para este diseño y material, si la hay. Si
// más de una calza, manda la que más descuenta.
export function promocionVigente(
  diseno: string,
  material: string,
  promociones: Promocion[],
  hoy: string
): Promocion | null {
  const calzan = promociones.filter(
    (p) =>
      p.diseno === diseno &&
      (p.material === null || p.material === material) &&
      p.desde <= hoy &&
      hoy <= p.hasta
  );
  if (calzan.length === 0) return null;
  return calzan.reduce((mejor, p) => (p.descuento_pct > mejor.descuento_pct ? p : mejor));
}

function montajeDe(
  mapa: MapaCristal,
  origen: "stock" | "laboratorio",
  montaje: PrecioMontaje[]
): number {
  const diseno = disenoBase(mapa.tipo_lente);
  // En los tallados a medida el laboratorio cobra el montaje por cómo
  // sujeta el armazón, no por el material. "Cerrado" es el caso normal
  // (acetato y metálico cerrado); ranurado y perforado se cobran aparte
  // cuando corresponda.
  const material = origen === "laboratorio" ? "CERRADO" : mapa.montaje_material;
  if (!material) return 0;
  return montaje.find((m) => m.origen === origen && m.material === material && m.diseno === diseno)?.precio ?? 0;
}

// El costo del par y, sobre todo, de dónde sale. La regla es simple y es
// la que pidió la óptica: si el laboratorio lo tiene hecho, se pide hecho;
// se manda a tallar solo cuando no queda otra.
export function costoCristal(
  mapa: MapaCristal,
  ojos: Ojo[],
  catalogo: CatalogoLaboratorio,
  hoy: string
): CostoCristal | null {
  const diseno = disenoBase(mapa.tipo_lente);

  const cerrar = (
    origen: "stock" | "laboratorio",
    unitarios: number[],
    motivo: string,
    promocion: Promocion | null
  ): CostoCristal => {
    const montaje = montajeDe(mapa, origen, catalogo.montaje);
    const cristales = unitarios.reduce((s, u) => s + u, 0);
    // Los dos descuentos no se suman: manda el mayor, y la promoción va
    // solo sobre el cristal — el montaje se descuenta siempre al 10% (o
    // lo que tenga la óptica), como vino en la boleta.
    const pctCristal = Math.max(catalogo.descuentoPct, promocion?.descuento_pct ?? 0);
    const conIva = (dctoCristal: number) =>
      Math.round(
        (cristales * (1 - dctoCristal / 100) + montaje * (1 - catalogo.descuentoPct / 100)) * IVA
      );
    return {
      origen,
      diseno: origen === "laboratorio" ? disenoVigente(mapa, hoy) : null,
      material: origen === "laboratorio" ? mapa.material_laboratorio : mapa.material_stock,
      costo: conIva(pctCristal),
      costoSinPromocion: conIva(catalogo.descuentoPct),
      promocion,
      unitarios,
      montaje,
      descuento: Math.round(cristales * (pctCristal / 100) + montaje * (catalogo.descuentoPct / 100)),
      motivo,
    };
  };

  // 1. ¿Lo tiene hecho? Esto es lo barato y es lo que hay que intentar
  //    siempre. Tiene que estar disponible para LOS DOS ojos: de nada
  //    sirve tener uno hecho si el otro hay que tallarlo igual.
  if (mapa.material_stock) {
    const unitarios = ojos.map((ojo) =>
      diseno === "MONOFOCAL"
        ? precioStockOjo(mapa.material_stock!, ojo, catalogo.stock)
        : precioStockMultifocalOjo(mapa.material_stock!, diseno, ojo, catalogo.stock)
    );
    if (unitarios.every((u): u is number => u !== null)) {
      return cerrar(
        "stock",
        unitarios,
        `El laboratorio lo tiene hecho (${mapa.material_stock})`,
        promocionVigente(diseno, mapa.material_stock!, catalogo.promociones, hoy)
      );
    }
  }

  // 2. Si no, hay que mandarlo a tallar, con el diseño que corresponda
  //    pedir hoy (puede haber un cambio programado).
  const disenoLab = disenoVigente(mapa, hoy);
  if (!mapa.material_laboratorio || !disenoLab) return null;
  const fila = catalogo.laboratorio.find(
    (l) => l.diseno === disenoLab && l.material === mapa.material_laboratorio
  );
  if (!fila?.precio_unitario) return null;
  const unitario = fila.precio_unitario;
  const unitarios = ojos.map((ojo) => unitario + recargoOjo(ojo, catalogo.recargos));
  return cerrar(
    "laboratorio",
    unitarios,
    mapa.material_stock
      ? "El laboratorio no lo tiene hecho en esta receta, hay que tallarlo"
      : "El laboratorio no lo hace de stock, siempre se talla",
    promocionVigente(disenoLab, mapa.material_laboratorio, catalogo.promociones, hoy)
  );
}
