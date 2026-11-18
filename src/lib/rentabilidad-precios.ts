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
