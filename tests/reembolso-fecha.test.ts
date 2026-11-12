import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fechaDocumentos, fechaValidaDocumento } from '../src/lib/fecha-documentos';
const { perfil, rpc, revalidar } = vi.hoisted(() => ({ perfil: vi.fn(),rpc: vi.fn(),revalidar: vi.fn() }));
vi.mock('../src/lib/autorizacion', () => ({ requerirPerfil: perfil, SinPermiso: class extends Error {} }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
import { guardarReembolso } from '../src/lib/actions/seguros';
const id = 'f6ca2300-0701-4c82-b895-4a714f3f1969';
const ventaOk = { id, anulada: false };
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: ventaOk, error: null }),
      })),
    })),
  })),
}));
beforeEach(() => { vi.resetAllMocks(); perfil.mockResolvedValue({ supabase: { rpc, from: mockFrom }, tenantId: 'tenant-1' }); rpc.mockResolvedValue({data:true,error:null}); });
describe('fecha única y persistente de documentos', () => {
  it('la fecha guardada prevalece para ambos documentos aunque existan abonos posteriores', () => {
    expect(fechaDocumentos('2026-09-01T15:00:00Z',[{fecha:'2026-10-30T15:00:00Z',monto:1000}],'2026-10-29')).toBe('2026-10-29');
  });
  it('mantiene el día chileno del último abono como valor inicial', () => {
    expect(fechaDocumentos('2026-09-01T15:00:00Z',[{fecha:'2026-10-30T01:00:00Z',monto:1000}],null)).toBe('2026-10-29');
  });
  it('rechaza días inexistentes y fechas incompletas', () => {
    for (const fecha of ['2026-02-29','2026-02-30','2026-13-01','','29-10-2026']) expect(fechaValidaDocumento(fecha)).toBe(false);
    expect(fechaValidaDocumento('2028-02-29')).toBe(true);
  });
  it('exige sesión y guarda fecha y destino en una sola transacción', async () => {
    expect(await guardarReembolso(id,'2026-10-29','fonasa')).toEqual({ok:true});
    expect(perfil).toHaveBeenCalledWith({roles:['admin','ventas'],suscripcion:true});
    expect(rpc).toHaveBeenCalledWith('guardar_reembolso',{p_venta:id,p_fecha:'2026-10-29',p_entidad:'fonasa'});
    expect(revalidar).toHaveBeenCalledWith(`/ventas/${id}`,'layout');
  });
  it('un guardado fallido no se presenta como éxito', async () => {
    rpc.mockResolvedValue({data:null,error:{message:'db'}});
    expect((await guardarReembolso(id,'2026-10-29','fonasa')).ok).toBe(false);
    expect(revalidar).not.toHaveBeenCalled();
  });
  it('rechaza destino y fecha inválidos antes de escribir', async () => {
    expect((await guardarReembolso(id,'2026-02-30','fonasa')).ok).toBe(false);
    expect((await guardarReembolso(id,'2026-10-29','otro')).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
