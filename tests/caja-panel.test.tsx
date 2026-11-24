import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
const { tablas, exigirRolPagina, cargarPendientes, leerEstadoCuenta } = vi.hoisted(() => ({ tablas: {} as Record<string, { data: unknown; error: null | { message:string } }>, exigirRolPagina:vi.fn(), cargarPendientes:vi.fn(), leerEstadoCuenta:vi.fn() }));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/lib/autorizacion',()=>({exigirRolPagina}));
vi.mock('@/lib/resumen-pendientes',()=>({cargarPendientes}));
vi.mock('@/lib/cuenta-mercadopago',()=>({leerEstadoCuenta}));
vi.mock('@/lib/actions/gastos',()=>({crearGastoGlobal:vi.fn()}));
vi.mock('@/components/cuenta-bancaria',()=>({default:()=> <section>CUENTA_MERCADO_PAGO</section>}));
vi.mock('@/components/caja-formulario',()=>({default:({children,texto}:{children:ReactNode;texto?:string})=><div>{children}<button>{texto}</button></div>}));
vi.mock('@/components/boton-enviar',()=>({default:({children}:{children:ReactNode})=><button>{children}</button>}));
import Caja from '../src/app/(app)/(protegido)/caja/page';
import CajaHistorial from '../src/components/caja-historial';
function consulta(tabla:string) {
  const q:Record<string,unknown>={};
  for(const m of ['select','eq','order','range','limit','single','in']) q[m]=()=>q;
  q.then=(resolver:(r:unknown)=>unknown)=>Promise.resolve(tablas[tabla] ?? {data:[],error:null}).then(resolver);
  return q;
}
const costos = { costo_transporte:0,costo_arriendo:0,costo_viaticos:0,costo_otros:0,comision_vendedora_pct:0,comision_vendedora_base:'venta_total',ahorro_pct:0 };
const op=(id:string,nombre:string,monto:number)=>({operativoId:id,nombre,fecha:'2026-11-01',fides:monto,marcos:0,gastos:0,personas:{pablo:0,madre:0,isadora:0},ahorro:0,total:monto});
beforeEach(()=>{
  vi.clearAllMocks();
  for(const k of Object.keys(tablas)) delete tablas[k];
  tablas.caja_global={data:{entro_efectivo:100000,salio_efectivo:0,entro_digital:200000,entro_debito:0,entro_credito:0,salio_digital:0},error:null};
  tablas.caja_conteos={data:[{contado:100000,esperado:100000,created_at:'2026-11-01T12:00:00Z'}],error:null};
  leerEstadoCuenta.mockResolvedValue({saldo:{estado:'disponible',disponible:200000,total:200000,consultadoEn:'2026-11-01T12:00:00Z'},estado:'correcto',ultimaCorrecta:'2026-11-01T12:00:00Z',errorCodigo:null});
  tablas.tenants={data:{comision_debito_pct:0,comision_credito_pct:0},error:null};
  tablas.operativos={data:[{...costos,id:'a',nombre:'Operativo Norte',fecha:'2026-11-01'},{...costos,id:'b',nombre:'Operativo Sur',fecha:'2026-11-02'}],error:null};
  tablas.ventas={data:[{id:'v1',total:80000,operativo_id:'a',pagos_abonos:[{monto:20000}]},{id:'v2',total:40000,operativo_id:'b',pagos_abonos:[{monto:50000}]}],error:null};
  tablas.retiros_sueldo={data:[{id:'r1',fecha:'2026-11-01',monto:10000,caja:'digital',persona:'ahorro',operativo_id:'a'}],error:null};
  exigirRolPagina.mockResolvedValue({tenantId:'tenant-test',supabase:{from:(t:string)=>consulta(t),rpc:(t:string)=>consulta(t)}});
  cargarPendientes.mockResolvedValue({error:null,sinAsignar:false,utilidadOperativos:120000,resumen:{total:50000,ahorro:20000,personas:{pablo:0,madre:0,isadora:0},fides:50000,marcos:0,gastos:0,operativos:[op('a','Operativo Norte',30000),op('b','Operativo Sur',20000)]}});
});
const html=async(ver='resumen',operativo='',sede?:string|string[])=>renderToStaticMarkup(await Caja({searchParams:Promise.resolve({ver,operativo,sede})}));
describe('panel financiero de Caja',()=>{
  it('conserva los impuestos declarados como compromisos de la óptica',async()=>{
    const anterior=await cargarPendientes();
    cargarPendientes.mockResolvedValue({...anterior,impuestosPendientes:30000});
    expect(await html('pendientes')).toContain('SII declarado por pagar');
  });
  it('muestra saldo global y solo las cifras de la sede elegida',async()=>{
    const s=await html('resumen','','a');
    expect(s).toContain('Cobrado hasta ahora');
    expect(s).toContain('20.000');
    expect(s).toContain('60.000');
    expect(s).toContain('300.000');
    expect(s).toContain('Guardar gasto');
    expect(s).not.toContain('50.000');
    expect(s).not.toContain('Guardar conteo');
    expect(cargarPendientes).not.toHaveBeenCalled();
    expect(exigirRolPagina).toHaveBeenCalledWith(['admin']);
  });
  it('suma varias sedes sin que el sobrepago compense la deuda de otro cliente',async()=>{
    const s=await html('resumen','',['a','b']);
    expect(s).toContain('70.000');
    expect(s).toContain('60.000');
    expect(s).toContain('120.000');
  });
  it('distingue selección vacía de la selección automática',async()=>{
    const s=await html('resumen','','');
    expect(s).toContain('Elige las sedes que quieres sumar');
    expect(s).not.toContain('Cobrado hasta ahora');
  });
  it('filtra pendientes por operativo sin restar sobrepagos de otra venta',async()=>{
    const s=await html('pendientes','b');
    expect(s).toContain('/operativos/b/cierre');
    expect(s).not.toContain('/operativos/a/cierre');
    expect(s).toContain('Clientes por cobrar');
    expect(s).not.toContain('60.000');
    expect(s).not.toContain('CUENTA_MERCADO_PAGO');
  });
  it('solo ofrece conteo y devolución en Cuadrar',async()=>{
    const s=await html('cuadrar');
    expect(s).toContain('Guardar conteo');
    expect(s).toContain('CUENTA_MERCADO_PAGO');
    expect(s).not.toContain('Guardar gasto');
    expect(s).not.toContain('Después de pendientes y ahorro');
  });
  it('no muestra cifras ni formularios parciales al fallar una lectura',async()=>{
    tablas.ventas={data:null,error:{message:'fallo de prueba'}};
    const s=await html('movimientos');
    expect(s).toContain('No se pudo leer toda la caja');
    expect(s).not.toContain('Guardar gasto');
    expect(s).not.toContain('230.000');
  });
  it('sin saldo externo no presenta el saldo calculado como liquidez',async()=>{leerEstadoCuenta.mockResolvedValue({saldo:{estado:'no_habilitado'},estado:'error',ultimaCorrecta:null,errorCodigo:'PAGOS_HTTP_401'});const s=await html();expect(s).toContain('Por verificar');expect(s).not.toContain('230.000');});
  it('envía las devoluciones a Gastos y conserva la prioridad sin restar la deuda de caja',async()=>{
    tablas.gastos_globales={data:[{id:'g',fecha:'2026-11-01',descripcion:'Compra de prueba',monto:150000,caja:'personal',monto_estimado:true}],error:null};
    const cuadrar=await html('cuadrar');expect(cuadrar).toContain('/gastos#adelantos-personales');expect(cuadrar).not.toContain('Compra de prueba');
    expect(cuadrar).toContain('Primero se devuelve el dinero personal');expect(cuadrar).not.toContain('230.000');
  });
  it('el historial por operativo excluye traslados globales y otros operativos',()=>{
    const s=renderToStaticMarkup(<CajaHistorial operativoId="a" operativos={[{id:'a',nombre:'Norte'}]} cobros={[{id:'c1',fecha:'2026-11-04',monto:15000,medio_pago:'efectivo',venta_id:'v1',operativo_id:'a'},{id:'c2',fecha:'2026-11-04',monto:80000,medio_pago:'efectivo',venta_id:'v2',operativo_id:'b'}]} gastos={[]} retiros={[]} traslados={[{id:'t1',fecha:'2026-11-04',monto:90000,caja:'digital',tipo:'deposito',descripcion:'TRASLADO_GLOBAL'}]} />);
    expect(s).toContain('15.000');
    expect(s).not.toContain('80.000');
    expect(s).not.toContain('TRASLADO_GLOBAL');
    expect(s).toContain('Norte');
    expect(s).toContain('04');
  });
});
