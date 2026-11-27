import { diaEnChile } from "./fechas";

export function efectivoDesdeConteo(registrado:number,conteo?:{contado:number;esperado:number}|null){
 return conteo?conteo.contado+(registrado-conteo.esperado):null;
}
export function prioridadCaja(efectivo:number|null,banco:number|null,deudaPersonal:number){
 const verificado=efectivo!==null&&banco!==null;
 const total=verificado?efectivo+banco:null;
 return {total,paraDevolver:total===null?null:Math.min(Math.max(0,total),deudaPersonal),paraRepartir:total===null?null:Math.max(0,total-deudaPersonal)};
}


export function confirmarSaldoDesdeRegistro(
  saldoRegistrado: number | null, hoy: string,
  registro?: { saldo: number; saldo_registrado: number; confirmado_en: string } | null,
) {
  return registro && saldoRegistrado !== null && registro.saldo_registrado === saldoRegistrado
    && diaEnChile(registro.confirmado_en) === hoy ? registro : null;
}

export function disponibleParaRepartir(
  banco: number | null, efectivo: number | null, porPagar: number,
  cobradoTrasCompromisos: number, repartoPendiente: number,
) {
  if (banco === null || efectivo === null) return null;
  return Math.max(0, Math.min(banco + efectivo - porPagar, cobradoTrasCompromisos, repartoPendiente));
}
