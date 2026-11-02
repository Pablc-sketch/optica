import { describe,it,expect,vi,afterEach } from 'vitest';
import { menuParaRol,enlaceActivo } from '../src/lib/navegacion';
import { filtrosCajaMercadoPago,estadoPagoMercadoPago } from '../src/lib/mercadopago-caja';
import { saldoUnicoPorVenta } from '../src/lib/saldo-ordenes';
import { inicioDelDia,finDelDia,diaEnChile } from '../src/lib/fechas';
afterEach(()=>vi.useRealTimers());
describe('auditoría de caja y navegación',()=>{
  it('muestra Caja MP únicamente al administrador de la óptica conectada',()=>{
    expect(menuParaRol('admin',true).some(n=>n.href==='/caja/mercadopago')).toBe(true);
    for(const rol of ['ventas','clinico','bodega','desconocido']) expect(menuParaRol(rol,true).some(n=>n.href==='/caja/mercadopago')).toBe(false);
    expect(menuParaRol('admin',false).some(n=>n.href==='/caja/mercadopago')).toBe(false);
  });
  it('evita opciones financieras para bodega y clínico, pero deja su pantalla principal accesible en móvil',()=>{
    for(const rol of ['clinico','bodega']) {
      const menu=menuParaRol(rol,true);
      expect(menu.some(n=>n.movil)).toBe(true);
      expect(menu.some(n=>['/reportes','/precios','/pagos'].includes(n.href))).toBe(false);
    }
  });
  it('marca el destino más específico y no sus vecinos',()=>{
    const menu=menuParaRol('admin',true);
    expect(enlaceActivo(menu,'/ventas/historial')).toBe('/ventas/historial');
    expect(enlaceActivo(menu,'/ot/buscar')).toBe('/ot/buscar');
    expect(enlaceActivo(menu,'/ventas-no')).toBeUndefined();
  });
  it('normaliza filtros dañados y limita la paginación sin llevar sintaxis de consulta al servidor',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-02T01:00:00Z'));
    const f=filtrosCajaMercadoPago({desde:'2026-99-22',hasta:'incorrecto',operacion:'1,estado.eq.approved',pagina:'-2',ver:'inventado'});
    expect(f).toEqual({desde:'2026-10-03',hasta:'2026-11-01',operacion:'',pagina:1,ver:'todos'});
    expect(filtrosCajaMercadoPago({desde:'2026-11-05',hasta:'2026-10-30',pagina:'999999'})).toMatchObject({desde:'2026-10-30',hasta:'2026-10-30',pagina:10000});
  });
  it('no cuenta dos veces la deuda de una venta con dos órdenes',()=>{
    expect(saldoUnicoPorVenta([{ventaId:'A',saldo:30000},{ventaId:'A',saldo:30000},{ventaId:'B',saldo:12000},{ventaId:'C',saldo:-1000}])).toBe(42000);
  });
  it('incluye la hora repetida de abril y respeta la medianoche inexistente de septiembre',()=>{
    expect(inicioDelDia('2026-09-06')).toBe('2026-09-06T04:00:00.000Z');
    expect(inicioDelDia('2026-04-05')).toBe('2026-04-05T04:00:00.000Z');
    expect(finDelDia('2026-04-04')).toBe('2026-04-05T03:59:59.999999Z');
    expect(diaEnChile('2026-04-05T03:30:00Z')).toBe('2026-04-04');
    expect(new Date('2026-10-31T02:59:59.950Z').getTime()).toBeLessThanOrEqual(Date.parse(finDelDia('2026-10-30')));
  });
  it('no convierte un pago pendiente o desconocido en rechazado',()=>{
    expect(estadoPagoMercadoPago('pending')).toBe('Pendiente');
    expect(estadoPagoMercadoPago('algo_nuevo')).toBe('En revisión');
  });
});
