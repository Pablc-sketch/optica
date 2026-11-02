import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const { perfil, rpc, admin, revalidar } = vi.hoisted(() => ({ perfil: vi.fn(), rpc: vi.fn(), admin: vi.fn(), revalidar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/autorizacion', () => ({ requerirPerfil: perfil }));
vi.mock('../src/lib/supabase/admin', () => ({ createAdminClient: admin }));
vi.mock('../src/lib/mercadopago-sync', () => ({ mercadoPagoConfigurado: (id: string) => id === 'global', sincronizarMercadoPago: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: revalidar }));
import { confirmarPacienteMercadoPago } from '../src/lib/actions/mercadopago';

const input = { pagoId: '186851523418', abonoId: '504d6326-8884-4956-b2d6-9b129dc0f1fa',
  identidad: { venta_id: 'f6ca2300-0701-4c82-b895-4a714f3f1969', paciente_id: '3c6136ee-2b52-43eb-b374-670f6803ee67',
    paciente_nombre: 'Paciente de prueba', paciente_rut: '12345678-5', monto: 19000, medio_pago: 'debito', fecha_abono: '2026-10-30T14:35:22Z' },
  operacionEscrita: '186851523418', cotejado: true };
beforeEach(() => {
  vi.resetAllMocks();
  perfil.mockResolvedValue({ tenantId: 'global', user: { id: 'actor-de-sesion' } });
  rpc.mockResolvedValue({ data: true, error: null }); admin.mockReturnValue({ rpc });
});
afterEach(() => vi.unstubAllEnvs());

describe('confirmación de identidad antes de asociar un voucher', () => {
  it('exige admin y obtiene óptica y actor de la sesión, nunca del formulario', async () => {
    expect((await confirmarPacienteMercadoPago(input)).ok).toBe(true);
    expect(perfil).toHaveBeenCalledWith({ roles: ['admin'], suscripcion: true });
    expect(rpc).toHaveBeenCalledWith('mercadopago_confirmar_vinculo', { p_tenant: 'global', p_actor: 'actor-de-sesion',
      p_pago: input.pagoId, p_abono: input.abonoId, p_esperado: input.identidad });
  });
  it('no permite acceso privilegiado si falla la sesión', async () => {
    perfil.mockRejectedValue(new Error('Sin permiso'));
    await expect(confirmarPacienteMercadoPago(input)).rejects.toThrow('Sin permiso');
    expect(admin).not.toHaveBeenCalled();
  });
  it('no usa la cuenta de Global para otra óptica', async () => {
    perfil.mockResolvedValue({ tenantId: 'otra', user: { id: 'otro-actor' } });
    expect((await confirmarPacienteMercadoPago(input)).ok).toBe(false);
    expect(admin).not.toHaveBeenCalled();
  });
  it('requiere cotejo explícito y transcripción exacta de la operación', async () => {
    for (const cambio of [{ cotejado: false }, { operacionEscrita: '123456789' }, { abonoId: 'inválido' }]) {
      expect((await confirmarPacienteMercadoPago({ ...input, ...cambio })).ok).toBe(false);
    }
    expect(admin).not.toHaveBeenCalled();
  });
  it('no muestra éxito ni revalida cuando la base rechaza una identidad obsoleta', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Los datos cambiaron. Recarga.' } });
    expect(await confirmarPacienteMercadoPago(input)).toEqual({ ok: false, mensaje: 'Los datos cambiaron. Recarga.' });
    expect(revalidar).not.toHaveBeenCalled();
  });
});
