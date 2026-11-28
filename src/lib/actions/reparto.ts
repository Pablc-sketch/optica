"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/autorizacion";
import { montoCaja } from "@/lib/caja-fuentes";
import { buscarAmbitoReparto, cargarCajaChequeo, rutaReparto } from "@/lib/datos-caja-chequeo";
import { sueldosRegistrables } from "@/lib/datos-reparto-disponible";
import { hoyEnChile } from "@/lib/fechas";
import { PERSONAS_SUELDO, cierrePorConfirmar } from "@/lib/reparto-operativos";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registrarPagoReparto(_estado: { error?: string }, form: FormData) {
  let destino: string;
  try {
    const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    const operativo = String(form.get("operativo") || "");
    const chequeo = String(form.get("chequeo") || "");
    const id = String(form.get("id") || "");
    const version = String(form.get("version") || "");
    const persona = String(form.get("persona") || "") as typeof PERSONAS_SUELDO[number];
    const caja = String(form.get("caja") || "");
    const monto = montoCaja(form.get("monto"));
    if (Boolean(operativo) === Boolean(chequeo) || !UUID.test(operativo || chequeo) || !UUID.test(id)
      || !/^\d+$/.test(version) || !PERSONAS_SUELDO.includes(persona) || !["digital", "efectivo"].includes(caja)
      || monto === null || monto <= 0) return { error: "Revisa el monto, la caja y la persona." };

    const ambito = await buscarAmbitoReparto(supabase, tenantId, { operativo: operativo || undefined, chequeo: chequeo || undefined });
    if (!ambito) return { error: "Operativo o chequeo no disponible." };
    destino = operativo ? `/operativos/${operativo}/cierre?guardado=1#sueldos`
      : rutaReparto(ambito.chequeo).replace("#", "&guardado=1#");
    const anterior = await supabase.from("retiros_sueldo").select("persona,monto,caja,operativo_id,chequeo_id,reparto_verificado")
      .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    if (anterior.error) return { error: "No se pudo comprobar si el pago ya estaba registrado." };
    if (anterior.data) {
      if (!anterior.data.reparto_verificado || anterior.data.persona !== persona || anterior.data.caja !== caja
        || anterior.data.monto !== monto || anterior.data.operativo_id !== (operativo || null)
        || anterior.data.chequeo_id !== (chequeo || null)) return { error: "El identificador del pago ya se usó." };
    } else {
      const actual = await supabase.rpc("version_caja_reparto");
      if (actual.error || actual.data !== version) return { error: "La caja cambió. Recarga antes de registrar el pago." };
      const hoy = hoyEnChile();
      const datos = await cargarCajaChequeo(supabase, tenantId, ambito.chequeo, ambito.sedes, hoy);
      if (!datos || datos.retirosSinAsignar) return { error: "Revisa los retiros históricos sin asociar antes de registrar otro pago." };
      const sede = datos.repartoOperativos.find(f => f.sede.id === operativo);
      if (operativo && (!sede || sede.porCobrar > 0)) {
        return { error: "Cobra el saldo del operativo antes de confirmar sus sueldos." };
      }
      if (monto > Math.min(sueldosRegistrables(datos)[persona], sede?.pendiente[persona] ?? Infinity)) {
        return { error: "El monto supera el sueldo pendiente que cubren los cobros registrados." };
      }
      const { error } = await createAdminClient().rpc("registrar_pago_reparto", {
        p_tenant: tenantId, p_usuario: user.id, p_id: id, p_operativo: operativo || null, p_chequeo: chequeo || null,
        p_version: version, p_persona: persona, p_monto: monto, p_caja: caja,
      });
      if (error) return { error: error.message };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "No se pudo registrar el reparto." };
  }
  for (const ruta of ["/caja", "/reportes", "/gastos", "/operativos", "/"]) revalidatePath(ruta);
  redirect(destino);
}

export async function finalizarSueldosOperativo(_estado: { error?: string }, form: FormData) {
  const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const operativo = String(form.get("operativo") ?? "");
  const version = String(form.get("version") ?? "");
  if (!UUID.test(operativo) || !/^\d+$/.test(version)) return { error: "Recarga el cierre e inténtalo de nuevo." };
  const actual = await supabase.rpc("version_caja_reparto");
  if (actual.error || actual.data !== version) return { error: "La caja cambió. Recarga antes de finalizar." };
  const ambito = await buscarAmbitoReparto(supabase, tenantId, { operativo });
  if (!ambito) return { error: "Operativo no disponible." };
  const datos = await cargarCajaChequeo(supabase, tenantId, ambito.chequeo, ambito.sedes, hoyEnChile());
  const sede = datos?.repartoOperativos.find(f => f.sede.id === operativo);
  if (!datos || !sede) return { error: "No se pudieron verificar las ventas y sueldos." };
  if (datos.retirosSinAsignar) return { error: "Concilia primero los retiros históricos sin asociar." };
  const pendiente = cierrePorConfirmar(sede);
  if (pendiente) return { error: pendiente };
  const { error } = await createAdminClient().rpc("finalizar_sueldos_operativo", {
    p_tenant: tenantId, p_usuario: user.id, p_operativo: operativo, p_version: version,
  });
  if (error) return { error: error.message };
  for (const ruta of ["/caja", "/reportes", "/operativos", "/entregas", "/ot", "/"]) revalidatePath(ruta);
  redirect(`/operativos/${operativo}/cierre?guardado=1#sueldos`);
}

export async function asociarRetiroHistorico(_estado: { error?: string }, form: FormData) {
  const { supabase } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const id = String(form.get("id") || "");
  const [tipo, destino] = String(form.get("destino") || "").split(":");
  if (!UUID.test(id) || !UUID.test(destino || "") || !["operativo", "chequeo"].includes(tipo)) {
    return { error: "Elige el destino del retiro." };
  }
  const { error } = await supabase.rpc("asociar_retiro_historico", {
    p_id: id, p_operativo: tipo === "operativo" ? destino : null, p_chequeo: tipo === "chequeo" ? destino : null,
  });
  if (error) return { error: error.message };
  for (const ruta of ["/caja", "/reportes", "/operativos", "/"]) revalidatePath(ruta);
  return {};
}
