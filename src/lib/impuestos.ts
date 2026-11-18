import { fechaValidaDocumento } from './fecha-documentos';
export type MesImpuesto = {
  periodo:string; ventas_afectas:number|null; credito_fiscal:number; ppm:number; otros:number;
  recargos:number; total_declarado:number|null; vence_el:string|null; nota:string; version:number;
};
export type PagoImpuesto = {id:string;periodo:string;gasto_id:string;anulado_en:string|null};
export const periodoValido=(p:string)=>/^\d{4}-(0[1-9]|1[0-2])-01$/.test(p)&&fechaValidaDocumento(p);
export function impuestoDeMes(m:MesImpuesto,ventasRegistradas:number,pagado:number,hoy:string) {
  const ventas=m.ventas_afectas??ventasRegistradas;
  const debito=Math.round(ventas*19/119);
  const iva=Math.max(0,debito-m.credito_fiscal);
  const estimado=iva+m.ppm+m.otros+m.recargos;
  // El total F29 ingresado incluye sus recargos; nunca sumarlos otra vez.
  const total=m.total_declarado??estimado;
  const saldo=Math.max(0,total-pagado),extra=Math.max(0,pagado-total);
  const declarado=m.total_declarado!==null;
  return {debito,iva,estimado,total,pagado,saldo,extra,declarado,
    vencido:declarado&&saldo>0&&!!m.vence_el&&m.vence_el<hoy};
}
export function resumirImpuestos(filas:ReturnType<typeof impuestoDeMes>[]) {
  return filas.reduce((r,f)=>({declarado:r.declarado+(f.declarado?f.saldo:0),estimado:r.estimado+(!f.declarado?f.saldo:0),
    vencido:r.vencido+(f.vencido?f.saldo:0),pagado:r.pagado+f.pagado}),{declarado:0,estimado:0,vencido:0,pagado:0});
}
export function mesesDesde(inicio:string,fin:string) {
  const meses:string[]=[];let p=inicio.slice(0,7)+'-01';const ultimo=fin.slice(0,7)+'-01';
  while(p<=ultimo&&meses.length<1200){meses.push(p);const [a,m]=p.split('-').map(Number);p=`${m===12?a+1:a}-${String(m===12?1:m+1).padStart(2,'0')}-01`;}
  return meses;
}
export function validarMesImpuesto(m:MesImpuesto,hoy:string) {
  if(!periodoValido(m.periodo)||m.periodo>hoy.slice(0,7)+'-01')return 'Elige un período tributario válido hasta el mes actual.';
  const valores=[m.ventas_afectas,m.credito_fiscal,m.ppm,m.otros,m.recargos,m.total_declarado];
  if(valores.some(v=>v!==null&&(!Number.isSafeInteger(v)||v<0||v>999999999999)))return 'Ingresa montos en pesos enteros positivos o cero.';
  if(m.vence_el&&!fechaValidaDocumento(m.vence_el))return 'Revisa el vencimiento.';
  if(m.nota.length>500)return 'La nota admite hasta 500 caracteres.';
  return null;
}
