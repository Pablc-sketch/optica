export function efectivoDesdeConteo(registrado:number,conteo?:{contado:number;esperado:number}|null){
 return conteo?conteo.contado+(registrado-conteo.esperado):null;
}
export function prioridadCaja(efectivo:number|null,banco:number|null,deudaPersonal:number){
 const verificado=efectivo!==null&&banco!==null;
 const total=verificado?efectivo+banco:null;
 return {total,paraDevolver:total===null?null:Math.min(Math.max(0,total),deudaPersonal),paraRepartir:total===null?null:Math.max(0,total-deudaPersonal)};
}
