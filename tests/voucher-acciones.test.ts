import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, requerirPerfil } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), requerirPerfil: vi.fn() }));
vi.mock("@/lib/autorizacion", () => ({ requerirPerfil, SinPermiso: class SinPermiso extends Error {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/catalogo-laboratorio", () => ({ cargarCatalogoParaCotizar: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
import { cobrarSaldo, registrarAbono, registrarConsulta, registrarVenta } from "../src/lib/actions/ventas";

const id = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  from.mockImplementation(() => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }),
    single: vi.fn().mockResolvedValue({ data: { id }, error: null }),
  }));
  requerirPerfil.mockResolvedValue({ supabase: { rpc, from }, tenantId: "optica-ficticia" });
  rpc.mockResolvedValue({ error: null, data: { aplicado: 80000 } });
});

describe("validación del voucher en servidor", () => {
  it("bloquea una venta con abono inicial de tarjeta sin voucher antes de consultar datos", async () => {
    const resultado = await registrarVenta({ ventaId: id, pacienteId: null, items: [], cristales: [], armazones: [], abonoInicial: 80000, medioPago: "debito" });
    expect(resultado.ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bloquea el cobro del saldo sin voucher", async () => {
    expect((await cobrarSaldo({ ventaId: id, operacionId: id, monto: 80000, medioPago: "credito" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("envía el voucher y la misma clave de operación para un cobro atómico", async () => {
    const resultado = await cobrarSaldo({ ventaId: id, operacionId: id, monto: 80000, medioPago: "debito", numeroVoucher: "000123" });
    expect(resultado.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("registrar_abono_con_voucher", { p_id: id, p_venta_id: id, p_monto: 80000, p_medio_pago: "debito", p_numero_voucher: "000123" });
  });
  it("exige voucher también en consultas", async () => {
    expect((await registrarConsulta({ consultaId: id, operativoId: null, monto: 5000, medioPago: "debito" })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("registra consulta y voucher juntos", async () => {
    await registrarConsulta({ consultaId: id, operativoId: null, monto: 5000, medioPago: "debito", numeroVoucher: "001234", cantidad: 2 });
    expect(rpc).toHaveBeenCalledWith("registrar_venta_con_voucher", expect.objectContaining({ p: expect.objectContaining({ abono: 10000, numero_voucher: "001234" }) }));
  });
  it("el formulario antiguo de abonos usa la misma validación", async () => {
    const datos = new FormData();
    datos.set("venta_id", id); datos.set("operacion_id", id); datos.set("monto", "80.000"); datos.set("medio_pago", "debito");
    expect((await registrarAbono(datos)).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("permite efectivo sin exigir un número inexistente", async () => {
    expect((await cobrarSaldo({ ventaId: id, operacionId: id, monto: 80000, medioPago: "efectivo" })).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("registrar_abono_con_voucher", expect.objectContaining({ p_numero_voucher: null }));
  });
  it("rechaza un abono para una venta que no pertenece al tenant actual", async () => {
    from.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const resultado = await cobrarSaldo({ ventaId: "11111111-1111-4111-8111-111111111111", operacionId: id, monto: 80000, medioPago: "debito", numeroVoucher: "000123" });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/no pertenece|óptica/i);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rechaza una consulta asociada a un operativo ajeno al tenant actual", async () => {
    from.mockImplementationOnce(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }));
    const resultado = await registrarConsulta({ consultaId: id, operativoId: "22222222-2222-4222-8222-222222222222", monto: 5000, medioPago: "debito", numeroVoucher: "001234", cantidad: 1 });
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toMatch(/operativo|óptica/i);
    expect(rpc).not.toHaveBeenCalled();
  });
});
