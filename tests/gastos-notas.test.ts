import {beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({perfil:vi.fn(),update:vi.fn(),eq:vi.fn(),redirect:vi.fn(),revalidar:vi.fn()}));
vi.mock('@/lib/autorizacion',()=>({requerirPerfil:m.perfil}));
vi.mock('next/navigation',()=>({redirect:m.redirect}));
vi.mock('next/cache',()=>({revalidatePath:m.revalidar}));
import {guardarNotaGasto} from '../src/lib/actions/caja';
const id='11111111-1111-4111-8111-111111111111';
const form=(nota:string)=>{const f=new FormData();f.set('gasto_id',id);f.set('nota',nota);return f;};
beforeEach(()=>{
 vi.clearAllMocks();const q={eq:m.eq,select:()=>({maybeSingle:async()=>({data:{id},error:null})})};
 m.eq.mockReturnValue(q);m.update.mockReturnValue(q);
 m.perfil.mockResolvedValue({tenantId:'tenant-autorizado',supabase:{from:()=>({update:m.update})}});
});
describe('nota del gasto sin alteraciones monetarias',()=>{
 it('actualiza solo la nota en el tenant autorizado y vuelve a Gastos',async()=>{
  await guardarNotaGasto(form('  Compra para próximos operativos.  '));
  expect(m.perfil).toHaveBeenCalledWith({roles:['admin'],suscripcion:true});
  expect(m.update).toHaveBeenCalledWith({nota:'Compra para próximos operativos.'});
  expect(m.eq).toHaveBeenCalledWith('tenant_id','tenant-autorizado');expect(m.eq).toHaveBeenCalledWith('id',id);
  expect(m.redirect).toHaveBeenCalledWith('/gastos?guardado=1#adelantos-personales');
 });
 it('rechaza notas extensas y falta de autorización antes de escribir',async()=>{
  await expect(guardarNotaGasto(form('x'.repeat(1001)))).rejects.toThrow('Revisa');expect(m.update).not.toHaveBeenCalled();
  m.perfil.mockRejectedValue(new Error('No autorizado'));
  await expect(guardarNotaGasto(form('Compra de prueba'))).rejects.toThrow('No autorizado');expect(m.update).not.toHaveBeenCalled();
 });
});
