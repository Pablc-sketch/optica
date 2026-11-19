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
    const [archivo, point] = await Promise.allSettled([sincronizarMercadoPago(tenant), sincronizarOrdenesPoint(tenant)]);
    if(archivo.status==='rejected')throw new Error('Archivo pendiente');
    const resultado = {...archivo.value, point:point.status==='fulfilled'?point.value.revisados:null};
    return Response.json(resultado, { status: resultado.estado === 'no_configurado' ? 503 : 200 });
  } catch {
    return Response.json({ error: 'Sincronización pendiente de reintento' }, { status: 503 });
  }
}
