import { fechaValidaDocumento } from '@/lib/fecha-documentos';
import { hoyEnChile } from '@/lib/fechas';
export function filtrosCajaMercadoPago(params: { desde?: string; hasta?: string; operacion?: string; ver?: string; pagina?: string }) {
  const hoy = hoyEnChile();
  const hace30 = new Date(`${hoy}T12:00:00Z`); hace30.setUTCDate(hace30.getUTCDate() - 29);
  const porDefecto = hace30.toISOString().slice(0,10);
  const hasta = fechaValidaDocumento(params.hasta) ? params.hasta : hoy;
  const elegido = fechaValidaDocumento(params.desde) ? params.desde : porDefecto;
  const desde = elegido <= hasta ? elegido : hasta;
  return { desde, hasta, operacion: /^[0-9]{1,30}$/.test(params.operacion ?? '') ? params.operacion! : '',
    ver: params.ver === 'pendientes' ? 'pendientes' : 'todos',
    pagina: Math.max(1, Math.min(10000, Number.parseInt(params.pagina ?? '1',10) || 1)) };
}
export function estadoPagoMercadoPago(estado: string) {
  return ({ approved: 'Aprobado', pending: 'Pendiente', in_process: 'En proceso', rejected: 'Rechazado',
    refunded: 'Devuelto', cancelled: 'Cancelado', charged_back: 'Contracargo', in_mediation: 'En revisión' } as Record<string,string>)[estado] ?? 'En revisión';
}
