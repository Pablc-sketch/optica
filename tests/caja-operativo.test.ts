import { describe, expect, it } from 'vitest';
import { resumenSedeCaja, sedesDeCaja } from '@/lib/caja-operativo';
import { pagosConAsignaciones, PREFIJO_FIDES, prefijoCosto } from '@/lib/pagos-operativo';

const sedes = [
  { id: 'a156d110-dedc-47c6-ad72-ddd85fc38e49', nombre: 'Los Molles', fecha: '2026-11-23' },
  { id: '76b79bf1-c8f7-40b3-8399-21f8bc0b154a', nombre: 'Trapiche', fecha: '2026-11-23' },
  { id: '780d1d22-1079-4bdd-9ddc-3b5784ad8fc0', nombre: 'Los Quinquelles', fecha: '2026-11-24' },
  { id: 'otra', nombre: 'Otra sede', fecha: '2026-11-24' },
  { id: 'viernes', nombre: 'Viernes', fecha: '2026-11-27' },
  { id: 'cancelada', nombre: 'Cancelada', fecha: '2026-11-27', estado: 'cancelado' },
];

describe('Caja del operativo', () => {
  it('muestra sedes activas en ausencia de un chequeo o filtro', () => {
    expect(sedesDeCaja(sedes, '2026-11-24').map(s => s.nombre)).toEqual(['Los Quinquelles', 'Otra sede']);
    expect(sedesDeCaja(sedes, '2026-11-27').map(s => s.nombre)).toEqual(['Viernes']);
    expect(sedesDeCaja(sedes, '2026-11-24', ['otra', 'desconocida']).map(s => s.id)).toEqual(['otra']);
  });

  it('incluye Minimarket y deja un cierre archivado fuera de la selección inicial', () => {
    const minimarket = { id: '0aea4291-ba76-4092-b0f4-53178911ca19', nombre: 'Minimarket', fecha: '2026-11-25' };
    const archivada = { ...sedes[0], archivado_en: '2026-11-25' };
    const lista = [archivada, ...sedes.slice(1), minimarket];
    expect(sedesDeCaja(lista, '2026-11-25').map(s => s.nombre)).toEqual(['Minimarket']);
    expect(sedesDeCaja(lista, '2026-11-25', [archivada.id])).toEqual([archivada]);
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

  it('resta pagos directos y vinculados de su concepto, sin compensar otro costo', () => {
    const sede = { ...sedes[0], costo_transporte: 12000, costo_arriendo: 4000, costo_viaticos: 0, costo_otros: 0,
      costo_fides_real: 10000, costo_marco_unitario: 5000, comision_vendedora_pct: 0, comision_vendedora_base: 'venta_total', ahorro_pct: 0 };
    const pagos = pagosConAsignaciones([
      { descripcion: PREFIJO_FIDES, monto: 11000 },
      { descripcion: prefijoCosto('costo_transporte'), monto: 5000 },
    ], [
      { id: 'activo', gasto_id: 'g1', operativo_id: sede.id, clave: 'costo_arriendo', monto: 2500, anulado_en: null },
      { id: 'anulado', gasto_id: 'g2', operativo_id: sede.id, clave: 'costo_transporte', monto: 7000, anulado_en: '2026-11-24' },
      { id: 'ajeno', gasto_id: 'g3', operativo_id: 'otra', clave: 'costo_transporte', monto: 7000, anulado_en: null },
    ], sede.id);
    expect(resumenSedeCaja(sede, [], 0, 0, pagos)).toMatchObject({ porPagar: 8500, cristales: 10000, gastos: 16000 });
  });
});
