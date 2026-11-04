import { beforeEach,describe,expect,it,vi } from 'vitest';
const mock=vi.hoisted(()=>({perfil:vi.fn(),rpc:vi.fn(),from:vi.fn(),caja:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/autorizacion',()=>({requerirPerfil:mock.perfil,SinPermiso:class SinPermiso extends Error {}}));
vi.mock('@/lib/actions/caja',()=>({guardarMovimientoCaja:mock.caja}));
import { guardarRegistroFinanzas } from '../src/lib/actions/finanzas';
import { SinPermiso } from '../src/lib/autorizacion';
const id='9df2e1b4-8aa9-4ca0-b3ac-96dd9e3ff7e8';
function datos(overrides:Record<string,string>={}) {
  const f=new FormData();
  for(const [k,v] of Object.entries({id,tipo:'gasto',fecha:'2026-01-01',monto:'25000',caja:'personal',descripcion:'Bandejas',categoria:'otro',tenant_id:'otra-optica',...overrides}))f.set(k,v);
  return f;
}
beforeEach(()=>{
  vi.resetAllMocks();
  mock.perfil.mockResolvedValue({tenantId:'mi-optica',supabase:{rpc:mock.rpc,from:mock.from}});
  mock.rpc.mockResolvedValue({error:null});
});
describe('Registro financiero · autorización y reintentos',()=>{
  it('exige administración y suscripción; nunca toma el tenant del formulario',async()=>{
    expect(await guardarRegistroFinanzas({},datos())).toMatchObject({guardado:true,id});
    expect(mock.perfil).toHaveBeenCalledWith({roles:['admin'],suscripcion:true});
    expect(mock.rpc).toHaveBeenCalledWith('revisar_movimiento_financiero',expect.objectContaining({p_accion:'crear',p_id:id,p_datos:expect.objectContaining({monto:25000,caja:'personal',operativo_id:null})}));
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain('otra-optica');
  });
  it('un reintento idéntico confirma el registro existente sin insertar una segunda salida',async()=>{
    mock.rpc.mockResolvedValue({error:{code:'23505'}});
    const eq=vi.fn();const q={select:()=>q,eq,maybeSingle:async()=>({data:{fecha:'2026-01-01',monto:25000,caja:'personal',operativo_id:null,descripcion:'Bandejas',categoria:'otro'},error:null})};eq.mockReturnValue(q);mock.from.mockReturnValue(q);
    expect(await guardarRegistroFinanzas({},datos())).toMatchObject({guardado:true});
    expect(eq).toHaveBeenCalledWith('tenant_id','mi-optica');
    expect(mock.rpc).toHaveBeenCalledTimes(1);
  });
  it('una colisión con otro importe nunca se presenta como guardada',async()=>{
    mock.rpc.mockResolvedValue({error:{code:'23505'}});
    const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{fecha:'2026-01-01',monto:30000,caja:'personal'},error:null})};mock.from.mockReturnValue(q);
    expect(await guardarRegistroFinanzas({},datos())).toHaveProperty('error');
  });
  it('un dato inválido o un rol sin permiso no llega a la escritura',async()=>{
    expect(await guardarRegistroFinanzas({},datos({monto:'-1'}))).toHaveProperty('error');
    expect(mock.rpc).not.toHaveBeenCalled();
    mock.perfil.mockRejectedValue(new SinPermiso('Sin permiso'));
    expect(await guardarRegistroFinanzas({},datos())).toEqual({error:'Sin permiso'});
    expect(mock.rpc).not.toHaveBeenCalled();
  });
  it('los traslados usan su dirección explícita y no se guardan como un retiro de sueldo',async()=>{
    mock.caja.mockResolvedValue({guardado:true});
    expect(await guardarRegistroFinanzas({},datos({tipo:'traslado',direccion:'deposito'}))).toMatchObject({guardado:true});
    const f=mock.caja.mock.calls[0][0] as FormData;
    expect(f.get('tipo')).toBe('deposito');expect(f.get('caja')).toBe('digital');expect(mock.rpc).not.toHaveBeenCalled();
  });
});
