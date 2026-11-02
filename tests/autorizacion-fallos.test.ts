import {describe,it,expect,vi,beforeEach} from 'vitest';
const {rpc,maybeSingle,getUser}=vi.hoisted(()=>({rpc:vi.fn(),maybeSingle:vi.fn(),getUser:vi.fn()}));
vi.mock('../src/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser},rpc,from:()=>({select:()=>({eq:()=>({maybeSingle})})})})}));
vi.mock('next/navigation',()=>({redirect:()=>{throw Error('redirect')}}));
import {requerirPerfil,SinPermiso} from '../src/lib/autorizacion';
beforeEach(()=>{vi.resetAllMocks();getUser.mockResolvedValue({data:{user:{id:'usuario'}}});maybeSingle.mockResolvedValue({data:{tenant_id:'global',rol:'admin',estado:'activo'}});});
describe('autorización cerrada ante fallos',()=>{
  it('solo permite operar con suscripción verificada explícitamente',async()=>{
    for(const r of [{data:null,error:null},{data:true,error:{message:'red'}},{data:false,error:null}]) {
      rpc.mockResolvedValue(r);await expect(requerirPerfil({suscripcion:true})).rejects.toBeInstanceOf(SinPermiso);
    }
    rpc.mockResolvedValue({data:true,error:null});expect((await requerirPerfil({suscripcion:true})).tenantId).toBe('global');
  });
  it('no consulta suscripción ni permite rol prohibido o cuenta desactivada',async()=>{
    maybeSingle.mockResolvedValue({data:{tenant_id:'global',rol:'ventas',estado:'activo'}});
    await expect(requerirPerfil({roles:['admin'],suscripcion:true})).rejects.toBeInstanceOf(SinPermiso);
    maybeSingle.mockResolvedValue({data:{tenant_id:'global',rol:'admin',estado:'inactivo'}});
    await expect(requerirPerfil({roles:['admin'],suscripcion:true})).rejects.toBeInstanceOf(SinPermiso);
    expect(rpc).not.toHaveBeenCalled();
  });
});
