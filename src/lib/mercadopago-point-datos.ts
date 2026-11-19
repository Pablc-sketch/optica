// Solo campos mínimos del proveedor; nunca tarjetas ni identidad del pagador.
export type OrdenPoint={id:string;tenant_id:string;venta_id:string;actor_id:string;monto:number;terminal_id:string;collector_id:string;order_id:string|null;pago_id:string|null;estado:string;creado_en:string;confirmado_en:string|null};
export const referenciaPoint=(id:string)=>`lentia-${id}`;
export function pagoConfirmadoDeOrden(raw:Record<string,unknown>,c:OrdenPoint):string|null {
  const config=raw.config as {point?:{terminal_id?:unknown}}|undefined;
  const tx=raw.transactions as {payments?:Record<string,unknown>[]}|undefined;
  if(raw.id!==c.order_id||raw.type!=='point'||String(raw.user_id)!==c.collector_id||raw.currency!=='CLP'
    ||raw.external_reference!==referenciaPoint(c.id)||config?.point?.terminal_id!==c.terminal_id)throw new Error('ORDEN_NO_COINCIDE');
  if(raw.status!=='processed')return null;
  if(!Array.isArray(tx?.payments)||tx.payments.length!==1)throw new Error('TRANSACCION_INVALIDA');
  const p=tx.payments[0];
  const reference=p.reference as {id?:unknown}|undefined;
  const ref=String(p.reference_id??reference?.id??'');
  if(p.status!=='processed'||String(p.amount)!==String(c.monto)||Number(p.refunded_amount??0)!==0
    ||(p.paid_amount!==undefined&&Number(p.paid_amount)!==c.monto)||!/^[0-9]{8,30}$/.test(ref))throw new Error('PAGO_NO_COINCIDE');
  return ref;
}
