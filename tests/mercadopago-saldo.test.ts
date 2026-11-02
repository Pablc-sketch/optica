import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import { consultarSaldoMercadoPago } from '../src/lib/mercadopago-saldo';
const config={tenant:'global',token:'solo-servidor'};
const respuesta=(p:unknown,status=200)=>new Response(JSON.stringify(p),{status});
describe('saldo real sin inferencias',()=>{
  it('no consulta con credencial de otra óptica ni un collector manipulado',async()=>{
    const solicitar=vi.fn();
    expect((await consultarSaldoMercadoPago('otra','123',config,solicitar)).estado).toBe('no_configurado');
    expect((await consultarSaldoMercadoPago('global','123/path',config,solicitar)).estado).toBe('no_configurado');
    expect(solicitar).not.toHaveBeenCalled();
  });
  it('consulta solo lectura, sin caché y con límite de espera',async()=>{
    const solicitar=vi.fn().mockResolvedValue(respuesta({user_id:123,currency_id:'CLP',available_balance:100,total_amount:150}));
    expect(await consultarSaldoMercadoPago('global','123',config,solicitar)).toMatchObject({estado:'disponible',disponible:100,total:150});
    expect(solicitar.mock.calls[0][1]).toMatchObject({cache:'no-store',redirect:'error',headers:{Authorization:'Bearer solo-servidor'}});
    expect(solicitar.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('acepta cero como saldo real, pero nunca convierte un fallo o permiso denegado en cero',async()=>{
    const solicitar=vi.fn().mockResolvedValue(respuesta({},403));
    expect(await consultarSaldoMercadoPago('global','123',config,solicitar)).toEqual({estado:'no_habilitado'});
    solicitar.mockResolvedValue(respuesta({user_id:123,currency_id:'CLP',available_balance:0,total_amount:0}));
    expect(await consultarSaldoMercadoPago('global','123',config,solicitar)).toMatchObject({estado:'disponible',disponible:0});
  });
  it('rechaza otra cuenta, otra moneda y respuestas que no acrediten el saldo',async()=>{
    for(const p of [{user_id:456,currency_id:'CLP',available_balance:10,total_amount:10},{user_id:123,currency_id:'USD',available_balance:10,total_amount:10},{user_id:123,currency_id:'CLP',available_balance:'10',total_amount:10}]){
      expect(await consultarSaldoMercadoPago('global','123',config,vi.fn().mockResolvedValue(respuesta(p)))).toEqual({estado:'error'});
    }
  });
  it('no filtra el secreto en errores de red',async()=>{
    expect(await consultarSaldoMercadoPago('global','123',config,vi.fn().mockRejectedValue(new Error('solo-servidor')))).toEqual({estado:'error'});
  });
});
