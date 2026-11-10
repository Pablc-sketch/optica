export const MAX_PRECIO=999999999;
export function montoComercial(valor:FormDataEntryValue|null,obligatorio=true):number|null{
 const s=String(valor??'').trim().replace(/\./g,'');if(!s&&!obligatorio)return null;
 if(!/^\d+$/.test(s)||Number(s)>MAX_PRECIO)throw new Error('Completa los montos en pesos enteros, sin negativos.');return Number(s);
}
export function costoParPropio(tarifa:number,unidad:'unidad'|'par',montaje:number,ivaPct:number){
 if(![tarifa,montaje].every(n=>Number.isInteger(n)&&n>=0&&n<=MAX_PRECIO)||!Number.isFinite(ivaPct)||ivaPct<0||ivaPct>100)throw new Error('Revisa la tarifa, el montaje y el impuesto.');
 const costo=Math.round((tarifa*(unidad==='unidad'?2:1)+montaje)*(1+ivaPct/100));if(costo>MAX_PRECIO)throw new Error('El costo final excede el monto permitido.');return costo;
}
