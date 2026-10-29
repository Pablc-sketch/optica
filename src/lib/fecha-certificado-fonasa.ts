import { diaEnChile } from "./fechas";

// El certificado usa el último pago efectivo, no la fecha de creación de
// la venta ni el orden en que Supabase entrega los abonos. La fecha de
// emisión tributaria y la edad a la compra siguen siendo independientes.
export function fechaCertificadoFonasa(fechaVenta: string, pagos: readonly { fecha: string; monto: number }[]): string {
 const ultimo = pagos.filter(p => p.monto > 0 && Number.isFinite(Date.parse(p.fecha)))
  .reduce((max, p) => Math.max(max, Date.parse(p.fecha)), -Infinity);
 return diaEnChile(Number.isFinite(ultimo) ? new Date(ultimo) : fechaVenta);
}
