export type ReservaEquipo={id:string;nombre:string;fecha:string;fecha_fin:string|null;hora_inicio:string|null;hora_fin:string|null;recursos:string[]};
export function seCruzanReservas(a:Pick<ReservaEquipo,'fecha'|'fecha_fin'|'hora_inicio'|'hora_fin'>,b:Pick<ReservaEquipo,'fecha'|'fecha_fin'|'hora_inicio'|'hora_fin'>){
 const tramo=(r:typeof a)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha))return null;const ultimo=r.fecha_fin||r.fecha;
  if(r.hora_inicio&&r.hora_fin)return [r.fecha+'T'+r.hora_inicio.slice(0,5),ultimo+'T'+r.hora_fin.slice(0,5)];
  const dia=new Date(ultimo+'T00:00:00Z');if(Number.isNaN(dia.getTime()))return null;dia.setUTCDate(dia.getUTCDate()+1);return [r.fecha+'T00:00',dia.toISOString().slice(0,10)+'T00:00'];
 };
 const x=tramo(a),y=tramo(b);return !!(x&&y&&x[0]<y[1]&&y[0]<x[1]);
}
