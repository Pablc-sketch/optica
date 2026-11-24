import { describe, expect, it } from 'vitest';
import { resumenSedeCaja, sedesDeCaja } from '@/lib/caja-operativo';

const sedes = [
  { id: 'a156d110-dedc-47c6-ad72-ddd85fc38e49', nombre: 'Los Molles', fecha: '2026-11-23' },
  { id: '76b79bf1-c8f7-40b3-8399-21f8bc0b154a', nombre: 'Trapiche', fecha: '2026-11-23' },
  { id: '780d1d22-1079-4bdd-9ddc-3b5784ad8fc0', nombre: 'Los Quinquelles', fecha: '2026-11-24' },
  { id: 'otra', nombre: 'Otra sede', fecha: '2026-11-24' },
  { id: 'viernes', nombre: 'Viernes', fecha: '2026-11-27' },
  { id: 'cancelada', nombre: 'Cancelada', fecha: '2026-11-27', estado: 'cancelado' },
];

describe('Caja del operativo', () => {
  it('abre la gira indicada sin arrastrar otras sedes de esas mismas fechas', () => {
    expect(sedesDeCaja(sedes, '2026-11-24').map(s => s.nombre)).toEqual(['Los Molles', 'Trapiche', 'Los Quinquelles']);
    expect(sedesDeCaja(sedes, '2026-11-27').map(s => s.id)).toEqual(['viernes']);
    expect(sedesDeCaja(sedes, '2026-11-24', ['otra', 'desconocida']).map(s => s.id)).toEqual(['otra']);
  });

  it('calcula el líquido de las ventas y distingue los abonos de la utilidad', () => {
    const sede = { ...sedes[0], costo_transporte:4000, costo_arriendo:0, costo_viaticos:0, costo_otros:0,
      costo_marco_unitario:6000, costo_fides_real:13000, comision_vendedora_pct:10, comision_vendedora_base:'venta_total', ahorro_pct:20 };
    const venta = { total:80000, pagos_abonos:[{monto:40000,medio_pago:'debito'}],
      venta_items:[{cantidad:1,ordenes_trabajo:{costo_laboratorio:10000,costo_laboratorio_2:null}}] };
    const otra = { total:10000, pagos_abonos:[{monto:12000,medio_pago:'efectivo'}] };
    expect(resumenSedeCaja(sede, [venta, otra], 2, 3)).toMatchObject({
      vendido:90000, cobrado:52000, porCobrar:40000, efectivo:12000, digital:40000,
      cristales:13000, marcos:6000, gastos:4000, tarjeta:800, comisionVenta:9000, utilidad:57200,
    });
  });
});
