import { cajaDelPago } from '@/lib/caja';
import { numerosDeOperativo, type OperativoParaCierre, type VentaParaCierre } from '@/lib/cierre-operativo';
import { costosDeSede, saldoCostos, type PagoCosto } from '@/lib/pagos-operativo';

export const CATEGORIAS_CAJA = [
  { clave: 'costo_transporte', nombre: 'Bencina y transporte' },
  { clave: 'costo_equipos', nombre: 'Arriendo de equipo' },
  { clave: 'costo_comida', nombre: 'Comida' },
  { clave: 'costo_hospedaje', nombre: 'Hospedaje' },
  { clave: 'costo_peajes', nombre: 'Peajes y TAG' },
  { clave: 'costo_otros', nombre: 'Otro' },
] as const;

// Gira del 23 al 28 de noviembre. Se usan los IDs confirmados para distinguir
// estas sedes de otras atenciones agendadas en las mismas fechas.
const GIRA_NOVIEMBRE = [
  'a156d110-dedc-47c6-ad72-ddd85fc38e49',
  '76b79bf1-c8f7-40b3-8399-21f8bc0b154a',
  '780d1d22-1079-4bdd-9ddc-3b5784ad8fc0',
  '0855618b-916f-4459-8295-dbf2c2f4faf7',
  '0aea4291-ba76-4092-b0f4-53178911ca19',
  'db03f726-54a8-4072-bb59-47082b5d9251',
  'd76de0d8-7a5c-4bdd-8d34-58360f76cd82',
  '33bf5fe9-39ec-4de5-a94f-5061530d810a',
  '385fe772-f296-4a13-a457-85b9f1fd3d69',
];

export type SedeCaja = {
  id: string;
  nombre: string;
  fecha: string;
  fecha_fin?: string | null;
  hora_inicio?: string | null;
  estado?: string;
  archivado_en?: string | null;
  pagos_saldados_en?: string | null;
};

export function sedesDeCaja<T extends SedeCaja>(sedes: T[], hoy: string, filtro?: string | string[]) {
  const disponibles = sedes.filter(s => s.estado !== 'cancelado')
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? '') || a.nombre.localeCompare(b.nombre));
  if (filtro !== undefined) {
    const ids = new Set(Array.isArray(filtro) ? filtro : [filtro]);
    return disponibles.filter(s => ids.has(s.id));
  }
  const sedesActivas = disponibles.filter(s => !s.archivado_en);
  if (hoy >= '2026-11-23' && hoy <= '2026-11-28') {
    const gira = sedesActivas.filter(s => GIRA_NOVIEMBRE.includes(s.id) && s.fecha <= hoy);
    if (gira.length) return gira;
  }
  const activas = sedesActivas.filter(s => s.fecha <= hoy && (s.fecha_fin ?? s.fecha) >= hoy);
  if (activas.length) return activas;
  const ultima = sedesActivas.findLast(s => s.fecha < hoy)?.fecha;
  return sedesActivas.filter(s => s.fecha === ultima);
}

export function resumenSedeCaja(
  sede: SedeCaja & OperativoParaCierre, ventas: VentaParaCierre[], debito: number, credito: number, pagos: PagoCosto[] = [],
) {
  const numeros = numerosDeOperativo(sede, ventas, debito, credito);
  let porCobrar = 0;
  let efectivo = 0;
  for (const venta of ventas) {
    let cobrado = 0;
    for (const pago of venta.pagos_abonos ?? []) {
      cobrado += pago.monto;
      if (cajaDelPago(pago.medio_pago) === 'efectivo') efectivo += pago.monto;
    }
    porCobrar += Math.max(0, venta.total - cobrado);
  }
  return {
    ...sede, vendido: numeros.vendido, cobrado: numeros.cobrado, porCobrar, efectivo,
    digital: numeros.cobrado - efectivo, cristales: numeros.desglose.totalCristales,
    marcos: numeros.desglose.totalArmazones, otros: numeros.desglose.totalOtros,
    gastos: numeros.gastos, tarjeta: numeros.cierre.comisionTarjeta, comisionVenta: numeros.cierre.isadora,
    utilidad: numeros.cierre.gananciaLiquida,
    porPagar: sede.pagos_saldados_en ? 0 : saldoCostos(costosDeSede(sede, numeros.desglose, pagos)),
  };
}
