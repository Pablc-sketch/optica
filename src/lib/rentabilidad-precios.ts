import { precioParConMarco, type RecargosMarcos, type NivelMarco } from './niveles-marco';
export type PerfilPrecio={id:string;nombre:string;precio:number;costo:number;origen:string};
export function comisionHistorica(pagos:{monto:number;medio_pago:string}[],debito:number,credito:number){
  const total=pagos.reduce((s,p)=>s+Number(p.monto),0);
  return total>0?pagos.reduce((s,p)=>s+Number(p.monto)*(p.medio_pago==='debito'?debito:p.medio_pago==='credito'?credito:0),0)/total:null;
}
export function aportePorPar(perfil:PerfilPrecio,nivel:NivelMarco,tarifas:RecargosMarcos|null,marco:number,estuche:number,vendedoraPct:number,tarjetaPct:number){
  const precio=precioParConMarco(perfil.precio,nivel,tarifas);
  const operativo=precio*(1-(vendedoraPct+tarjetaPct)/100)-perfil.costo-marco-estuche;
  const iva=precio*19/119;
  return {precio,operativo,iva,conReserva:operativo-iva};
}

type LineaSimulada = { cantidad: number; precio: number; operativo: number; iva: number };

// Conserva decimales hasta presentar los resultados. El margen usa ventas
// sin IVA y el escenario reserva todo el débito, sin presumir crédito fiscal.
export function resumirSimulacion(lineas: LineaSimulada[], fijos: number, objetivo = 0) {
  const cantidad = lineas.reduce((s, l) => s + l.cantidad, 0);
  const ventas = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const reserva = lineas.reduce((s, l) => s + l.iva * l.cantidad, 0);
  const aporte = lineas.reduce((s, l) => s + l.operativo * l.cantidad, 0);
  const ventasNetas = ventas - reserva;
  const utilidadAntesReserva = aporte - fijos;
  const resultado = utilidadAntesReserva - reserva;
  const aportePorPar = cantidad > 0 ? (aporte - reserva) / cantidad : 0;
  const paresPara = (ganancia: number) => aportePorPar > 0
    ? Math.ceil((fijos + ganancia) / aportePorPar)
    : null;
  return {
    cantidad, ventas, reserva, ventasNetas, aporte, utilidadAntesReserva, resultado,
    margen: ventasNetas > 0 ? resultado / ventasNetas * 100 : null,
    aportePorPar,
    equilibrio: paresPara(0),
    paresObjetivo: paresPara(objetivo),
  };
}
