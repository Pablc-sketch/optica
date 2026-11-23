import { nombreNivelMarco, recargoMarco, type NivelMarco, type RecargosMarcos } from "./niveles-marco";
import type { ArmazonPedido, VentaNormalizada } from "./venta-normalizar";

export function lineaRecargo(numero: number, nivel: NivelMarco, tarifas: RecargosMarcos | null, cortesia = false, especial?: number | null) {
  const nombre = especial != null ? "Colección Especial" : nombreNivelMarco(nivel);
  return {
    key: `premium-${numero}`,
    descripcion: `Marco ${nombre} (par ${numero})`,
    cantidad: 1,
    precioUnitario: cortesia ? 0 : (especial ?? recargoMarco(nivel, tarifas)),
    recargoSlot: numero,
    nivelMarco: nivel,
  };
}

export function precioListaMarco(nivel: NivelMarco, tarifas: RecargosMarcos | null, especial?: number | null) {
  return (nivel === "especial" && especial != null) ? especial : recargoMarco(nivel, tarifas);
}

function especialDeInventario(marco: ArmazonPedido | undefined, especiales: ReadonlyMap<string, number>) {
  return marco?.productoId ? especiales.get(marco.productoId) : undefined;
}

// Los registros anteriores siguen sincronizando con el contrato original.
// Una edición manual conserva el vínculo con un único par.
export function validarRecargosVenta(
  venta: VentaNormalizada,
  tarifas: RecargosMarcos | null,
  especiales: ReadonlyMap<string, number> = new Map(),
): string | null {
  for (const c of venta.cristales) {
    const marco = venta.marcoDeCupo[c.cupo];
    const extras = venta.items.filter(i => i.marcoSlot === c.cupo);
    const nivel = marco?.nivelMarco;
    if (!nivel) {
      if (extras.length) return "Recargo sin línea de marco.";
      continue;
    }
    const especial = especialDeInventario(marco, especiales);
    if ((!tarifas && nivel === "seleccion") || (tarifas?.especial === undefined && nivel === "especial" && especial === undefined)) {
      return "Esta línea de marco no está habilitada.";
    }
    const ajusteManual = marco.recargoEditado === true;
    if (marco.marcoPropio || (nivel === "esencial" && !ajusteManual)) {
      if (extras.length) return "El marco propio o incluido no lleva un recargo de lista.";
      continue;
    }
    if (extras.length !== 1 || extras[0].cantidad !== 1 || extras[0].productoId) {
      return "Falta el cobro de marco del par o se agregó más de una vez.";
    }
    if (ajusteManual) continue;
    const cristal = venta.items.find(i => i.cristalSlot === c.cupo)!;
    const especialAnterior = nivel === "premium" && marco.recargoEditado === undefined ? especial : undefined;
    const cortesiaAnterior = cristal.precioUnitario === 0 && marco.recargoEditado === undefined;
    const esperado = cortesiaAnterior ? 0 : (especialAnterior ?? precioListaMarco(nivel, tarifas, especial));
    if (extras[0].precioUnitario !== esperado) {
      return "El precio de lista del marco cambió. Vuelve a aplicar la categoría o ingresa el precio acordado.";
    }
  }
  return null;
}
