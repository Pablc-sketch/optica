import { nivelesMarcoInventarioGlobal, nombreNivelMarco, recargoMarco, type MarcoInventarioGlobal, type NivelMarco, type RecargosMarcos } from './niveles-marco';
import type { VentaNormalizada } from './venta-normalizar';

export function lineaRecargo(numero:number,nivel:NivelMarco,tarifas:RecargosMarcos|null,cortesia=false,especial?:number|null){
  return {key:`premium-${numero}`,descripcion:`${especial!=null?"Colección Especial":`Línea ${nombreNivelMarco(nivel)}`} (par ${numero})`,cantidad:1,
    precioUnitario:cortesia?0:(especial??recargoMarco(nivel,tarifas)),recargoSlot:numero,nivelMarco:nivel};
}

// Las colas antiguas sin nivel mantienen su contrato. Las ventas nuevas
// deben conservar el recargo y su par al pasar por cualquier entrada.
export function validarRecargosVenta(
  venta: VentaNormalizada,
  tarifas: RecargosMarcos | null,
  especiales: ReadonlyMap<string, number> = new Map(),
  inventarioGlobal?: ReadonlyMap<string, MarcoInventarioGlobal>,
): string | null {
  for(const c of venta.cristales){
    const marco=venta.marcoDeCupo[c.cupo];
    const extras=venta.items.filter(i=>i.marcoSlot===c.cupo);
    const especial=marco?.productoId && !inventarioGlobal ? especiales.get(marco.productoId) : undefined;
    if(especial!==undefined&&marco?.nivelMarco!=='premium')return 'Vuelve a elegir el marco de Colección Especial antes de cobrar.';
    if(!marco?.nivelMarco){if(extras.length)return 'Recargo sin línea de marco.';continue;}
    const nivel=marco.nivelMarco;
    if (marco.productoId && inventarioGlobal) {
      const permitidos = nivelesMarcoInventarioGlobal(inventarioGlobal.get(marco.productoId) ?? { marca: null });
      if (!permitidos.includes(nivel)) return 'Vuelve a elegir la categoría del marco del inventario antes de cobrar.';
    }
    if((!tarifas&&nivel==='seleccion')||(tarifas?.especial===undefined&&nivel==='especial'))return 'Esta línea de marco no está habilitada.';
    const cristal=venta.items.find(i=>i.cristalSlot===c.cupo)!;
    const esperado=marco.marcoPropio||cristal.precioUnitario===0?0:(especial??recargoMarco(nivel,tarifas));
    if(nivel==='esencial'||marco.marcoPropio){if(extras.length)return 'Esencial y marco propio no llevan recargo.';}
    else if(extras.length!==1||extras[0].cantidad!==1||extras[0].productoId||extras[0].precioUnitario!==esperado){
      return 'El recargo del marco cambió o está incompleto. Vuelve a elegir la línea antes de cobrar.';
    }
  }
  return null;
}
