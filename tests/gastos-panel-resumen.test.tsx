import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const { tablas, exigirRolPagina, cargarCatalogoParaCotizar, capturarSimulador } = vi.hoisted(() => ({
  tablas: {} as Record<string, { data: unknown; error: null | {message:string} }>,
  exigirRolPagina:vi.fn(), cargarCatalogoParaCotizar:vi.fn(), capturarSimulador:vi.fn(),
}));
vi.mock('@/lib/autorizacion',()=>({exigirRolPagina}));
vi.mock('@/lib/catalogo-laboratorio',()=>({cargarCatalogoParaCotizar}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/gastos-panel',()=>({default:()=> <section>LISTADO_GASTOS</section>}));
vi.mock('@/components/simulador-salida',()=>({default:(props:Record<string,unknown>)=>{capturarSimulador(props);return <section>SIMULADOR</section>;}}));
import Gastos from '../src/app/(app)/(protegido)/gastos/page';
function consulta(tabla:string){
  const q:Record<string,unknown>={};
  for(const metodo of ['select','eq','order','range','single','is','limit'])q[metodo]=()=>q;
  q.then=(resolver:(r:unknown)=>unknown)=>Promise.resolve(tablas[tabla]??{data:[],error:null}).then(resolver);
  return q;
}
const operativo=(id:string,nombre:string,fecha:string,costo:number)=>({
  id,nombre,fecha,costo_transporte:costo,costo_arriendo:0,costo_viaticos:0,costo_otros:0,
  costo_marco_unitario:5000,costo_fides_real:null,comision_vendedora_pct:0,comision_vendedora_base:'venta_total',ahorro_pct:20,
});
async function pantalla(filtros:{op?:string;desde?:string;hasta?:string;ver?:string}={}){
  return renderToStaticMarkup(await Gastos({searchParams:Promise.resolve(filtros)}));
}
function resumen(html:string){return html.match(/<section[^>]+aria-label="Resumen de gastos"[\s\S]*?<\/section>/)?.[0]??'';}
beforeEach(()=>{
  vi.clearAllMocks();for(const k of Object.keys(tablas))delete tablas[k];
  tablas.operativos={data:[operativo('a','Norte','2026-11-01',20000),operativo('b','Sur','2026-11-02',70000)],error:null};
  tablas.tenants={data:{comision_debito_pct:0,comision_credito_pct:0},error:null};
  tablas.ventas={data:[{id:'va',operativo_id:'a',total:100000,pagos_abonos:[],venta_items:[]},{id:'vb',operativo_id:'b',total:300000,pagos_abonos:[],venta_items:[]}],error:null};
  exigirRolPagina.mockResolvedValue({tenantId:'tenant-test',supabase:{from:(t:string)=>consulta(t)}});
  cargarCatalogoParaCotizar.mockResolvedValue({filas:[],recargosMarcos:null,catalogo:[]});
});
describe('resumen de gastos y navegación de rentabilidad',()=>{
  it('calcula margen ponderado sobre todas las ventas, incluyendo lo pendiente de cobrar',async()=>{
    const html=await pantalla();const r=resumen(html);
    expect(r).toContain('90.000');expect(r).toContain('400.000');expect(r).toContain('310.000');
    expect(r).toContain('77,5%');expect(r).toContain('antes de IVA');
    expect(exigirRolPagina).toHaveBeenCalledWith(['admin']);
  });
  it('un pago salda la deuda sin descontar el mismo costo otra vez y stock no baja la utilidad',async()=>{
    tablas.gastos_globales={data:[
      {id:'p',operativo_id:'a',fecha:'2026-11-01',descripcion:'Costo operativo · costo_transporte · Norte',monto:20000,categoria:'transporte',caja:'digital'},
      {id:'stock',operativo_id:null,fecha:'2026-11-01',descripcion:'Compra stock',monto:200000,categoria:'compra_inventario',caja:'digital'},
      {id:'general',operativo_id:null,fecha:'2026-11-01',descripcion:'Servicio general',monto:10000,categoria:'otros',caja:'digital'},
    ],error:null};
    const r=resumen(await pantalla());
    expect(r).toContain('100.000');expect(r).toContain('70.000');expect(r).toContain('300.000');expect(r).toContain('75%');
  });
  it('no produce infinito o NaN sin ventas y conserva la pérdida por costos',async()=>{
    tablas.ventas={data:[],error:null};
    const r=resumen(await pantalla());
    expect(r).toContain('sin ventas');expect(r).toContain('90.000');expect(r).not.toMatch(/NaN|Infinity/);
  });
  it('filtra la sede y preserva sede y fechas al abrir el simulador',async()=>{
    const html=await pantalla({op:'b',desde:'2026-11-02',hasta:'2026-11-03'});
    expect(resumen(html)).toContain('230.000');expect(resumen(html)).not.toContain('310.000');
    expect(html).toContain('href="/gastos?op=b&amp;desde=2026-11-02&amp;hasta=2026-11-03&amp;ver=rentabilidad"');
    expect(html).not.toContain('desde=2026-11-23');
  });
  it('el simulador no impone las fechas de noviembre y volver a gastos conserva los filtros',async()=>{
    const html=await pantalla({ver:'rentabilidad',op:'a',desde:'2026-11-01',hasta:'2026-11-02'});
    expect(html).toContain('SIMULADOR');expect(html).not.toContain('LISTADO_GASTOS');
    expect(html).toContain('href="/gastos?op=a&amp;desde=2026-11-01&amp;hasta=2026-11-02"');
    expect(html).not.toContain('desde=2026-11-23');
  });
  it('el simulador incluye generales no asignados una sola vez, excluye stock y no aplica un preset',async()=>{
    tablas.gastos_globales={data:[
      {id:'pago-directo',operativo_id:'a',fecha:'2026-11-01',descripcion:'Costo operativo · costo_transporte · Norte',monto:20000,categoria:'transporte',caja:'digital'},
      {id:'stock',operativo_id:null,fecha:'2026-11-01',descripcion:'Compra stock',monto:200000,categoria:'compra_inventario',caja:'digital'},
      {id:'general',operativo_id:null,fecha:'2026-11-01',descripcion:'Servicio de transporte',monto:30000,categoria:'otros',caja:'digital'},
      {id:'sii',operativo_id:null,fecha:'2026-11-01',descripcion:'SII F29 · octubre',monto:50000,categoria:'otros',caja:'digital'},
    ],error:null};
    tablas.gastos_asignaciones={data:[{id:'asignacion',gasto_id:'general',operativo_id:'a',clave:'costo_transporte',monto:20000,anulado_en:null}],error:null};
    await pantalla({ver:'rentabilidad'});
    expect(capturarSimulador).toHaveBeenCalledOnce();
    expect(capturarSimulador.mock.calls[0][0]).toMatchObject({fijosRegistrados:100000});
  });
  it('no presenta cifras parciales cuando falla la lectura de pagos',async()=>{
    tablas.gastos_asignaciones={data:null,error:{message:'fallo ficticio'}};
    const html=await pantalla();
    expect(html).toContain('No se pudieron cargar todos los gastos');
    expect(html).not.toContain('Resumen de gastos');expect(html).not.toContain('LISTADO_GASTOS');
  });
  it('muestra la deuda personal aparte de la utilidad y descuenta solo devoluciones de ese gasto',async()=>{
    tablas.gastos_globales={data:[{id:'personal',operativo_id:null,fecha:'2026-11-01',descripcion:'Compra personal de prueba',nota:'Marcos y bandejas para operativos. Detalle por confirmar.',monto:200000,categoria:'compra_inventario',caja:'personal',monto_estimado:true}],error:null};
    tablas.caja_movimientos={data:[{id:'d1',gasto_id:'personal',monto:25000},{id:'d2',gasto_id:'otro',monto:70000}],error:null};
    const html=await pantalla({op:'a'});
    expect(html).toContain('Dinero personal por devolver');expect(html).toContain('$-175.000');expect(html).toContain('Nota de la compra');expect(html).toContain('Marcos y bandejas');expect(html).toContain('Importe aproximado');
    expect(resumen(html)).toContain('80.000');expect(resumen(html)).not.toContain('175.000');
  });
  it('centraliza el alta de gastos en su propia vista y conserva la sede',async()=>{
    const html=await pantalla({op:'a'});
    expect(html).toContain('href="/gastos?op=a&amp;ver=registrar"');
    expect(html).not.toContain('/caja?ver=movimientos#nuevo-gasto');
    const alta=await pantalla({ver:'registrar',op:'a'});
    expect(alta).toContain('Registrar gasto pagado');
    expect(alta).toMatch(/<option[^>]*value="a"[^>]*selected/);
    expect(alta).not.toContain('Resumen de gastos');
  });
  it('consulta los pagos anteriores en el historial sin mostrar la lista de pendientes',async()=>{
    tablas.gastos_globales={data:[{id:'pagado',operativo_id:'a',fecha:'2026-11-01',descripcion:'Pago histórico de ejemplo',monto:20000,categoria:'otro',caja:'digital',confirmado_en:'2026-11-23T16:00:00Z'}],error:null};
    const html=await pantalla({ver:'historial',op:'a'});
    expect(html).toContain('Pago histórico de ejemplo');
    expect(html).toContain('Confirmado');
    expect(html).not.toContain('Resumen de gastos');
  });
  it('muestra costo, abono y saldo bajo una sola sede aunque el operativo esté archivado',async()=>{
    const { default: Panel }=await vi.importActual<typeof import('@/components/gastos-panel')>('@/components/gastos-panel');
    const html=renderToStaticMarkup(<Panel hoy="2026-11-23" gastos={[]} asignaciones={[]} filas={[{
      id:'archivo',nombre:'Sede con saldo',fecha:'2026-11-01',archivado:true,pares:2,costoMarco:6000,
      costoFidesActual:null,costoFidesNota:null,importes:{},
      costos:[{clave:'fides',titulo:'Cristales (Fides)',total:19000,pagado:5000},{clave:'marcos',titulo:'Marcos',total:12000,pagado:0}],
    }]}/>);
    const lista=html.slice(0,html.indexOf('id="costos"'));
    expect(lista.match(/Sede con saldo/g)).toHaveLength(1);
    expect(lista).toContain('Archivado');
    expect(lista).toContain('Estimado según ventas');
    expect(lista).toContain('Costo total');
    expect(lista).toContain('19.000');
    expect(lista).toContain('5.000');
    expect(lista).toContain('14.000');
    expect(lista).toContain('26.000');
  });
  it('oculta cifras si no puede leer las devoluciones personales',async()=>{
    tablas.caja_movimientos={data:null,error:{message:'fallo de lectura'}};
    const html=await pantalla();expect(html).toContain('No se pudieron cargar todos los gastos');expect(html).not.toContain('Resumen de gastos');
  });
});
