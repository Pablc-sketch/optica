import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
const { tablas, exigirRolPagina, cargarPendientes } = vi.hoisted(() => ({ tablas: {} as Record<string, { data: unknown; error: null | { message:string } }>, exigirRolPagina:vi.fn(), cargarPendientes:vi.fn() }));
vi.mock('@/lib/autorizacion',()=>({exigirRolPagina}));
vi.mock('@/lib/resumen-pendientes',()=>({cargarPendientes}));
vi.mock('@/lib/actions/gastos',()=>({crearGastoGlobal:vi.fn()}));
vi.mock('@/components/cuenta-bancaria',()=>({default:()=> <section>CUENTA_MERCADO_PAGO</section>}));
vi.mock('@/components/caja-formulario',()=>({default:({children,texto}:{children:ReactNode;texto?:string})=><div>{children}<button>{texto}</button></div>}));
vi.mock('@/components/boton-enviar',()=>({default:({children}:{children:ReactNode})=><button>{children}</button>}));
import Caja from '../src/app/(app)/(protegido)/caja/page';
import CajaHistorial from '../src/components/caja-historial';
function consulta(tabla:string) {
  const q:Record<string,unknown>={};
  for(const m of ['select','eq','order','range','limit','single']) q[m]=()=>q;
  q.then=(resolver:(r:unknown)=>unknown)=>Promise.resolve(tablas[tabla] ?? {data:[],error:null}).then(resolver);
  return q;
}
const op=(id:string,nombre:string,monto:number)=>({operativoId:id,nombre,fecha:'2026-11-01',fides:monto,marcos:0,gastos:0,personas:{pablo:0,madre:0,isadora:0},ahorro:0,total:monto});
beforeEach(()=>{
  vi.clearAllMocks();
  for(const k of Object.keys(tablas)) delete tablas[k];
  tablas.caja_global={data:{entro_efectivo:100000,salio_efectivo:0,entro_digital:200000,entro_debito:0,entro_credito:0,salio_digital:0},error:null};
  tablas.tenants={data:{comision_debito_pct:0,comision_credito_pct:0},error:null};
  tablas.operativos={data:[{id:'a',nombre:'Operativo Norte',fecha:'2026-11-01'},{id:'b',nombre:'Operativo Sur',fecha:'2026-11-02'}],error:null};
  tablas.ventas={data:[{id:'v1',total:80000,operativo_id:'a',pagos_abonos:[{monto:20000}]},{id:'v2',total:40000,operativo_id:'b',pagos_abonos:[{monto:50000}]}],error:null};
  tablas.retiros_sueldo={data:[{id:'r1',fecha:'2026-11-01',monto:10000,caja:'digital',persona:'ahorro',operativo_id:'a'}],error:null};
  exigirRolPagina.mockResolvedValue({tenantId:'tenant-test',supabase:{from:(t:string)=>consulta(t),rpc:(t:string)=>consulta(t)}});
  cargarPendientes.mockResolvedValue({error:null,sinAsignar:false,utilidadOperativos:120000,resumen:{total:50000,ahorro:20000,personas:{pablo:0,madre:0,isadora:0},fides:50000,marcos:0,gastos:0,operativos:[op('a','Operativo Norte',30000),op('b','Operativo Sur',20000)]}});
});
const html=async(ver='resumen',operativo='')=>renderToStaticMarkup(await Caja({searchParams:Promise.resolve({ver,operativo})}));
describe('panel financiero de Caja',()=>{
  it('separa dinero, cobros pendientes y ahorro sin abrir formularios en Resumen',async()=>{
    const s=await html();
    expect(s).toContain('230.000');
    expect(s).toContain('60.000');
    expect(s).toContain('10.000');
    expect(s).not.toContain('Guardar conteo');
    expect(s).not.toContain('Guardar gasto');
    expect(exigirRolPagina).toHaveBeenCalledWith(['admin']);
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
  it('el historial por operativo excluye traslados globales y otros operativos',()=>{
    const s=renderToStaticMarkup(<CajaHistorial operativoId="a" operativos={[{id:'a',nombre:'Norte'}]} cobros={[{id:'c1',fecha:'2026-11-04',monto:15000,medio_pago:'efectivo',venta_id:'v1',operativo_id:'a'},{id:'c2',fecha:'2026-11-04',monto:80000,medio_pago:'efectivo',venta_id:'v2',operativo_id:'b'}]} gastos={[]} retiros={[]} traslados={[{id:'t1',fecha:'2026-11-04',monto:90000,caja:'digital',tipo:'deposito',descripcion:'TRASLADO_GLOBAL'}]} />);
    expect(s).toContain('15.000');
    expect(s).not.toContain('80.000');
    expect(s).not.toContain('TRASLADO_GLOBAL');
    expect(s).toContain('Norte');
    expect(s).toContain('04');
  });
});
