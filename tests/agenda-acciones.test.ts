import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), perfil: vi.fn(), revalidate: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/lib/autorizacion', () => ({ requerirPerfil: mocks.perfil, SinPermiso: class extends Error {} }));
import { guardarAgenda } from '@/lib/actions/agenda';
const id='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
function formulario(extra: Record<string,string>={}) {
 const datos = new FormData();
 Object.entries({ id,tipo:'externo',tipo_original:'propio',nombre:'Operativo ejemplo',optica:'Óptica ejemplo',fecha:'2033-11-18',fecha_fin:'2033-11-22',estado:'pendiente', ...extra }).forEach(([k,v]) => datos.set(k,v));
 return datos;
}
beforeEach(() => { vi.clearAllMocks(); mocks.perfil.mockResolvedValue({tenantId:'tenant',supabase:{rpc:mocks.rpc,from:mocks.from}}); });
describe('corregir operativos en la agenda', () => {
 it('cambia de propio a externo sin requerir horas y conserva el identificador', async () => {
  mocks.rpc.mockResolvedValue({data:id,error:null});
  await expect(guardarAgenda(true,{},formulario())).rejects.toThrow('REDIRECT:');
  expect(mocks.rpc).toHaveBeenCalledWith('agenda_reclasificar',{p:expect.objectContaining({id,origen:'propio',destino:'externo',hora_inicio:'',hora_fin:''})});
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('explica un cruce y no redirige ni invalida si falla la conversión',async () => {
  mocks.rpc.mockResolvedValue({error:{code:'23P01',message:'Cruce'}});
  expect(await guardarAgenda(true,{},formulario())).toEqual({error:'El rango se cruza con otro operativo. Revisa las fechas.'});
  expect(mocks.revalidate).not.toHaveBeenCalled();
 });
 it('permite eliminar aunque el formulario tenga campos incompletos', async () => {
  mocks.rpc.mockResolvedValue({data:id,error:null});
  await expect(guardarAgenda(true,{},formulario({accion:'eliminar',nombre:'',fecha_fin:'',optica:''}))).rejects.toThrow('eliminado=1');
  expect(mocks.rpc).toHaveBeenCalledWith('agenda_reclasificar',{p:{id,origen:'propio',destino:'eliminar'}});
 });
 it('conserva el mensaje que protege datos vinculados al eliminar',async () => {
  mocks.rpc.mockResolvedValue({error:{message:'Este operativo tiene datos vinculados.'}});
  expect(await guardarAgenda(true,{},formulario({accion:'eliminar'}))).toEqual({error:'Este operativo tiene datos vinculados.'});
 });
 it('rechaza convertir disponibilidad manipulando el formulario',async () => {
  expect(await guardarAgenda(true,{},formulario({tipo_original:'disponible'}))).toEqual({error:'No se puede convertir este registro.'});
  expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
