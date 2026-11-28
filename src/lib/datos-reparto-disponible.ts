import "server-only";
import { resumirCaja } from "./caja";
import { confirmarSaldoDesdeRegistro, efectivoDesdeConteo } from "./caja-verificada";
import { leerEstadoCuenta } from "./cuenta-mercadopago";
import { diaEnChile } from "./fechas";
import type { cargarCajaChequeo } from "./datos-caja-chequeo";
import type { createClient } from "./supabase/server";

type Cliente = Awaited<ReturnType<typeof createClient>>;
type Datos = NonNullable<Awaited<ReturnType<typeof cargarCajaChequeo>>>;

export async function saldosReparto(
  supabase: Cliente, tenantId: string, hoy: string, tenant: Datos["tenant"],
) {
  const [cuenta, caja, conteo, banco, deuda, devoluciones] = await Promise.all([
    leerEstadoCuenta(tenantId),
    supabase.rpc("caja_global").single(),
    supabase.from("caja_conteos").select("contado,esperado,created_at")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).order("id").limit(1),
    supabase.from("caja_saldos_confirmados").select("saldo,saldo_registrado,confirmado_en")
      .eq("tenant_id", tenantId).order("confirmado_en", { ascending: false }).order("id").limit(1),
    supabase.rpc("deuda_personal_pendiente"),
    supabase.rpc("devoluciones_venta_pendientes"),
  ]);
  const t = caja.data as { entro_efectivo: number; salio_efectivo: number; entro_digital: number;
    entro_debito: number; entro_credito: number; salio_digital: number } | null;
  const libro = t && !caja.error ? resumirCaja({
    entroEfectivo: t.entro_efectivo, salioEfectivo: t.salio_efectivo, entroDigital: t.entro_digital,
    entroDebito: t.entro_debito, entroCredito: t.entro_credito, salioDigital: t.salio_digital,
  }, {
    comisionDebitoPct: Number(tenant?.comision_debito_pct ?? 0),
    comisionCreditoPct: Number(tenant?.comision_credito_pct ?? 0),
  }) : null;
  const conteoGuardado = conteo.error ? null : conteo.data?.[0];
  const efectivo = libro ? efectivoDesdeConteo(libro.hayEfectivo, conteoGuardado) ?? libro.hayEfectivo : null;
  const efectivoVerificado = Boolean(conteoGuardado && libro?.hayEfectivo === conteoGuardado.esperado
    && diaEnChile(conteoGuardado.created_at) === hoy);
  const bancoRegistrado = libro?.hayDigital ?? null;
  const bancoManual = confirmarSaldoDesdeRegistro(bancoRegistrado, hoy, banco.error ? null : banco.data?.[0]);
  const saldoConfirmado = cuenta.saldo.estado === "disponible" ? cuenta.saldo.disponible : bancoManual?.saldo ?? null;
  return { efectivo, efectivoVerificado, cuenta: cuenta.saldo, bancoRegistrado, bancoManual, saldoConfirmado,
    deudaPersonal: deuda.error ? null : Number(deuda.data), devoluciones: devoluciones.error ? null : Number(devoluciones.data) };
}

export function disponibleDelReparto(datos: Datos, saldos: Awaited<ReturnType<typeof saldosReparto>>) {
  const { caja, sii } = datos;
  const { efectivo, efectivoVerificado, saldoConfirmado, deudaPersonal, devoluciones } = saldos;
  if (datos.retirosSinAsignar || !sii || saldoConfirmado === null || efectivo === null || !efectivoVerificado ||
      deudaPersonal === null || devoluciones === null) return null;
  const iva = Math.max(caja.ivaPendienteCaja, sii.saldo);
  const compromisos = caja.fidesPendiente + caja.marcosPendientes + caja.terrenoPendiente
    + Math.max(deudaPersonal, caja.porReembolsar) + caja.comisionPendiente + iva + devoluciones;
  return caja.pagableConCaja(deudaPersonal > 0 ? -caja.comisionPendiente : saldoConfirmado + efectivo - compromisos);
}


// Registra un pago ya efectuado. El banco puede haber procesado la salida
// antes de que administración la anote. El límite es lo cobrado en Lentia.
export function sueldosRegistrables(datos: Datos) {
  return datos.caja.pagableConCaja(datos.caja.saldoTrasPagos);
}
