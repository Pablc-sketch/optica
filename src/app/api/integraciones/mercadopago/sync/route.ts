import {ErrorMercadoPago} from '@/lib/mercadopago-api';
import {ReporteMPInvalido} from '@/lib/mercadopago-reporte-datos';
import {actualizarSaldoPorReporte,diagnosticarSaldoPorReporte,silenciarReportesMP} from '@/lib/mercadopago-reportes';
import {revisarConexionMP,integrarTerminalUnicaMP} from '@/lib/mercadopago-conexion';
import { timingSafeEqual } from 'node:crypto';
import { sincronizarOrdenesPoint } from '@/lib/mercadopago-point';
import { sincronizarMercadoPago } from '@/lib/mercadopago-sync';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(request: Request) {
  const secret = process.env.MERCADOPAGO_SYNC_SECRET;
  const recibido = request.headers.get('authorization') ?? '';
  const esperado = `Bearer ${secret}`;
  if (!secret || Buffer.byteLength(recibido) !== Buffer.byteLength(esperado) || !timingSafeEqual(Buffer.from(recibido), Buffer.from(esperado))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 });
  }
  const tenant = process.env.MERCADOPAGO_TENANT_ID;
  if (!tenant) return Response.json({ error: 'Sin configurar' }, { status: 503 });
  try {
    const opciones:unknown=await request.json().catch(()=>({}));
    if(opciones&&typeof opciones==='object'&&(opciones as {silenciar_reportes?:unknown}).silenciar_reportes===true){const avisos=await silenciarReportesMP(tenant);return Response.json(avisos,{status:'preferencias_reportes' in avisos?200:503});}
    if(opciones&&typeof opciones==='object'&&(opciones as {integrar_point?:unknown}).integrar_point===true)await integrarTerminalUnicaMP(tenant);
    const cierreAnterior=opciones&&typeof opciones==='object'&&(opciones as {saldo_cierre_anterior?:unknown}).saldo_cierre_anterior===true;
    const [archivo, point] = await Promise.allSettled([sincronizarMercadoPago(tenant), sincronizarOrdenesPoint(tenant),revisarConexionMP(tenant),actualizarSaldoPorReporte(tenant,{cierreAnterior:Boolean(cierreAnterior)})]);
    if(archivo.status==='rejected')throw new Error('Archivo pendiente');
    const diagnostico=opciones&&typeof opciones==='object'&&(opciones as {diagnosticar_saldo?:unknown}).diagnosticar_saldo===true?await diagnosticarSaldoPorReporte(tenant):undefined;
    const resultado = {...archivo.value, point:point.status==='fulfilled'?point.value.revisados:null,saldo_diagnostico:diagnostico};
    return Response.json(resultado, { status: resultado.estado === 'no_configurado' ? 503 : 200 });
  } catch(e) {
    const codigo=e instanceof ErrorMercadoPago||e instanceof ReporteMPInvalido?e.codigo:undefined;
    return Response.json({ error: 'Sincronización pendiente de reintento',codigo }, { status: 503 });
  }
}
