import {describe,it,expect,vi,beforeEach} from 'vitest';
import {registrarVenta,type VentaInput} from '../src/lib/actions/ventas';
import {RECARGOS_OPTICA_GLOBAL as tarifas, type NivelMarco} from '../src/lib/niveles-marco';
const mocks=vi.hoisted(()=>({perfil:vi.fn(),catalogo:vi.fn(),rpc:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/autorizacion',()=>({requerirPerfil:mocks.perfil,SinPermiso:class extends Error{}}));
vi.mock('@/lib/catalogo-laboratorio',()=>({cargarCatalogoParaCotizar:mocks.catalogo}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:vi.fn()}));
const fila={tipo_lente:'Monofocal',tratamiento:'Orgánico Antirreflejo',rango_receta:'±2.00 / ±2.00',costo:3975,precio_venta:55000,precio_venta_stock:38000,material_stock:'CR AR 1.56',material_laboratorio:'ORGANICO 1.56 HMC',diseno_laboratorio:'MONOFOCAL CONFORT',montaje_material:'ORGANICO SIMPLE'};
const cat={filas:[fila],recargosMarcos:tarifas,catalogo:{stock:[{material:'CR AR 1.56',diseno:'MONOFOCAL',esfera_max:2,cilindro_max:2,precio_unitario:670}],laboratorio:[],montaje:[{origen:'stock',material:'ORGANICO SIMPLE',diseno:'MONOFOCAL',precio:2000}],recargos:[],promociones:[],descuentoPct:0}};
function consulta(data:unknown){const b:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};for(const k of ['select','eq','order','limit','in'])b[k]=()=>b;b.single=async()=>({data,error:null});b.maybeSingle=b.single;return b;}
const venta=(nivel:NivelMarco,slot=1):VentaInput=>({ventaId:'00000000-0000-4000-8000-000000000001',pacienteId:'paciente',sucursalId:null,items:[{descripcion:'Cristales',cantidad:1,precioUnitario:38000,cristalSlot:slot},...(nivel==='esencial'?[]:[{descripcion:`Línea ${nivel}`,cantidad:1,precioUnitario:tarifas[nivel]!,marcoSlot:slot}])],cristales:[{slot,tipoLente:'Monofocal',tratamiento:'Orgánico Antirreflejo',rangoReceta:'±2.00 / ±2.00',posicion:'lejos'}],armazones:[{slot,productoId:null,marcoPropio:false,descripcion:'Acetato rojo',nivelMarco:nivel}],abonoInicial:0,medioPago:'efectivo'});
beforeEach(()=>{vi.clearAllMocks();mocks.perfil.mockResolvedValue({tenantId:'optica-ficticia',supabase:{from:mocks.from,rpc:mocks.rpc}});mocks.catalogo.mockResolvedValue(cat);mocks.rpc.mockResolvedValue({data:{ot_folio:100},error:null});mocks.from.mockImplementation((tabla:string)=>consulta(tabla==='tenants'?{factor_venta_cristales:6,dias_entrega_default:7}:tabla==='recetas'?{od_esfera:-1,oi_esfera:-1,od_cilindro:0,oi_cilindro:0,od_add:null,oi_add:null}:null));});
describe('Acción real de venta con líneas de marco',()=>{
 it.each(['esencial','seleccion','premium'] as const)('%s llega a orden y comprobante con costo recalculado',async nivel=>{
  expect((await registrarVenta(venta(nivel,2))).ok).toBe(true);
  const p=mocks.rpc.mock.calls[0][1].p;
  expect(p.ots[0].marco_descripcion).toMatch(nivel==='seleccion'?/Selección/:nivel==='premium'?/Premium/:/Esencial/);
  expect(p.ots[0].costo_laboratorio).toBe(3975);
  expect(p.items[0].cristal_slot).toBe(1);
  expect(p.items.reduce((s:number,i:{precio_unitario:number;cantidad:number})=>s+i.precio_unitario*i.cantidad,0)).toBe(nivel==='esencial'?38000:nivel==='seleccion'?49990:59990);
 });
 it('precio anterior de premium no se cobra por accidente',async()=>{const v=venta('premium');v.items[1].precioUnitario=10000;expect((await registrarVenta(v)).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('fallo de catálogo detiene la venta antes de guardar',async()=>{mocks.catalogo.mockRejectedValue(new Error('offline'));expect((await registrarVenta(venta('seleccion'))).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('cortesía no cobra recargo y conserva costo para la utilidad',async()=>{const v=venta('premium');v.items.forEach(i=>i.precioUnitario=0);expect((await registrarVenta(v)).ok).toBe(true);const p=mocks.rpc.mock.calls[0][1].p;expect(p.items.every((i:{precio_unitario:number})=>i.precio_unitario===0)).toBe(true);expect(p.ots[0].costo_laboratorio).toBe(3975);});
 it('cantidad o recargo duplicado no llega a la base',async()=>{const v=venta('seleccion');v.items.push({...v.items[1]});expect((await registrarVenta(v)).ok).toBe(false);expect(mocks.rpc).not.toHaveBeenCalled();});
 it('marco de inventario mantiene SKU y línea',async()=>{const v=venta('seleccion');v.armazones[0].productoId='producto';expect((await registrarVenta(v)).ok).toBe(true);expect(mocks.rpc.mock.calls[0][1].p.ots[0]).toMatchObject({armazon_producto_id:'producto',marco_descripcion:'Selección · Acetato rojo'});});
 it('marco propio no agrega recargo ni sale de inventario',async()=>{const v=venta('esencial');v.armazones[0].marcoPropio=true;expect((await registrarVenta(v)).ok).toBe(true);expect(mocks.rpc.mock.calls[0][1].p.ots[0]).toMatchObject({armazon_producto_id:null,marco_propio:true,marco_descripcion:null});});
});

describe('Marcos de inventario de Óptica Global', () => {
  function venderMarco(marca: string, sku: string | null, recargoAnterior: number | null, nivel: NivelMarco) {
    const consultas = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((tabla: string) => {
      if (tabla === 'tenants') return consulta({nombre_comercial: 'Óptica Global', factor_venta_cristales: 6, dias_entrega_default: 7});
      if (tabla === 'productos') return consulta([{id: 'producto', marca, sku, recargo_marco: recargoAnterior, precio_venta: 0}]);
      return consultas(tabla);
    });
    const v = venta(nivel);
    v.armazones[0].productoId = 'producto';
    v.items.push({productoId: 'producto', descripcion: marca, cantidad: 1, precioUnitario: 0});
    return registrarVenta(v);
  }

  it.each([
    ['FOOSE', 'seleccion', null, null, 49990, 'Selección'],
    ['SILMO', 'premium', 'ZD-21126 C-2', 26990, 59990, 'Premium'],
    ['LACROSSE', 'especial', 'LY-2187L C-2', 31990, 69990, 'Colección Especial'],
    ['LACROSSE', 'especial', 'LY-2187L C-4', 31990, 69990, 'Colección Especial'],
    ['LACROSSE', 'esencial', 'LY-2130L C-2', null, 38000, 'Esencial'],
  ] as const)('cobra %s en la categoría %s (SKU %s)', async (marca, nivel, sku, anterior, total, etiqueta) => {
    expect((await venderMarco(marca, sku, anterior, nivel)).ok).toBe(true);
    const p = mocks.rpc.mock.calls[0][1].p;
    expect(p.ots[0]).toMatchObject({armazon_producto_id: 'producto', marco_descripcion: `${etiqueta} · Acetato rojo`});
    expect(p.items.reduce((s: number, i: {precio_unitario: number; cantidad: number}) => s + i.precio_unitario * i.cantidad, 0)).toBe(total);
  });

  it.each([
    ['LACROSSE', 'especial', 'LY-2130L C-2'],
    ['LACROSSE', 'esencial', 'LY-2187L C-2'],
    ['LACROSSE', 'premium', 'LY-2187L C-4'],
    ['SILMO', 'especial', 'ZD-21126 C-2'],
    ['SILMO', 'esencial', null],
    ['VESPA', 'esencial', null],
  ] as const)('impide cobrar %s en la categoría %s (SKU %s)', async (marca, nivel, sku) => {
    expect((await venderMarco(marca, sku, null, nivel)).ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
