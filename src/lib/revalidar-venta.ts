import { revalidatePath } from 'next/cache';
// Cambiar una venta afecta también a sus pantallas de cobro, entrega y
// conciliación. Invalidar solo el punto de venta dejaba recibos anteriores.
export function revalidarOperacionVenta() {
  for (const ruta of ['/', '/cobros', '/entregas', '/ot', '/reportes', '/operativos', '/pagos', '/caja/mercadopago', '/configuracion/integraciones/mercadopago']) revalidatePath(ruta);
  revalidatePath('/ventas','layout');
}
