export const NIVELES_MARCO = [
  {id:'esencial',nombre:'Esencial'},
  {id:'seleccion',nombre:'Selección'},
  {id:'premium',nombre:'Premium'},
] as const;
export type NivelMarco=(typeof NIVELES_MARCO)[number]['id'];
export type RecargosMarcos=Record<NivelMarco,number>;
export const RECARGOS_OPTICA_GLOBAL:RecargosMarcos={esencial:0,seleccion:11990,premium:21990};
export function esNivelMarco(v:unknown):v is NivelMarco{return NIVELES_MARCO.some(n=>n.id===v);}
export function leerRecargosMarcos(v:unknown):RecargosMarcos|null {
  if(!v||typeof v!=='object')return null;
  const r=v as Record<string,unknown>;
  if(!NIVELES_MARCO.every(n=>Number.isSafeInteger(r[n.id])&&Number(r[n.id])>=0&&Number(r[n.id])<=99999999)||r.esencial!==0||Number(r.premium)<Number(r.seleccion))return null;
  return {esencial:0,seleccion:Number(r.seleccion),premium:Number(r.premium)};
}
export function nombreNivelMarco(n:NivelMarco){return NIVELES_MARCO.find(v=>v.id===n)!.nombre;}
export function recargoMarco(n:NivelMarco,tarifas:RecargosMarcos|null){
  return tarifas?tarifas[n]:n==='premium'?10000:0;
}
export function precioParConMarco(precioCristales:number,n:NivelMarco,tarifas:RecargosMarcos|null){
  return precioCristales+recargoMarco(n,tarifas);
}
