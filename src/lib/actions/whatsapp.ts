"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { createAdminClient } from "@/lib/supabase/admin";
import { datosDelNumero, whatsappConfigurado } from "@/lib/whatsapp-cloud";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function conPerfil(
  roles: ("admin" | "clinico" | "ventas" | "bodega")[],
  f: (ctx: Awaited<ReturnType<typeof requerirPerfil>>) => Promise<ResultadoAgenda>
): Promise<ResultadoAgenda> {
  try {
    return await f(await requerirPerfil({ roles, suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

// Conecta el número de WhatsApp Business de la óptica. Antes de guardar se
// pregunta a Meta si el token de Lentia puede usar ese número: así nadie
// puede anotar el número de otra óptica.
export async function conectarWhatsapp(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId, user }) => {
    const id = String(datos.get("phone_number_id") ?? "").replace(/\D/g, "");
    if (!/^[0-9]{5,30}$/.test(id)) return { error: "Pega el «Identificador del número de teléfono» que muestra Meta (solo números)." };
    if (!whatsappConfigurado()) return { error: "Falta activar WhatsApp en el servidor (claves de Meta en Vercel)." };
    // El número lo conecta quien administra Lentia, no cualquier óptica.
    const perfil = await supabase.from("users").select("es_superadmin").eq("id", user.id).single();
    if (!perfil.data?.es_superadmin) return { error: "Pide a Lentia que conecte el número de tu óptica." };
    const numero = await datosDelNumero(id);
    if (!numero) return { error: "Meta no reconoce ese número para la app de Lentia. Revisa el identificador y que el número esté agregado a la app." };
    const db = createAdminClient();
    const r = await db
      .from("whatsapp_numeros")
      .upsert({ tenant_id: tenantId, phone_number_id: id, telefono_visible: numero.telefono, activo: true }, { onConflict: "tenant_id" });
    if (r.error) return { error: r.error.code === "23505" ? "Ese número ya está conectado a otra óptica." : "No se pudo guardar el número." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: `Conectado: ${numero.telefono}${numero.nombre ? ` (${numero.nombre})` : ""}` };
  });
}

export async function pausarWhatsapp(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ tenantId }) => {
    const activo = datos.get("activo") === "on";
    const r = await createAdminClient().from("whatsapp_numeros").update({ activo }).eq("tenant_id", tenantId).select("tenant_id").single();
    if (r.error) return { error: "No se pudo cambiar." };
    revalidatePath("/configuracion/integraciones");
    return { mensaje: activo ? "El WhatsApp vuelve a agendar" : "Agenda por WhatsApp en pausa" };
  });
}

// Abre o cierra las horas de un operativo para WhatsApp.
export async function guardarAgendaOperativo(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin"], async ({ supabase, tenantId }) => {
    const id = String(datos.get("operativo_id") ?? "");
    const cupos = Number(datos.get("cupos_por_bloque"));
    const minutos = Number(datos.get("minutos_bloque"));
    if (!UUID.test(id) || !Number.isInteger(cupos) || cupos < 1 || cupos > 50 || ![10, 15, 20, 30, 45, 60].includes(minutos)) {
      return { error: "Revisa los cupos (1 a 50) y la duración de cada bloque." };
    }
    const abrir = datos.get("agenda_whatsapp") === "on";
    const op = await supabase.from("operativos").select("hora_inicio, hora_fin").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (op.error || !op.data) return { error: "No se encontró el operativo." };
    if (abrir && (!op.data.hora_inicio || !op.data.hora_fin)) return { error: "Primero define el horario del operativo (hora de inicio y término)." };
    const r = await supabase
      .from("operativos")
      .update({ agenda_whatsapp: abrir, cupos_por_bloque: cupos, minutos_bloque: minutos })
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("id")
      .single();
    if (r.error) return { error: "No se pudo guardar." };
    revalidatePath(`/operativos/${id}`);
    return { mensaje: abrir ? "Horas abiertas por WhatsApp" : "Agenda por WhatsApp cerrada" };
  });
}

// Marcar asistencia o anular desde Lentia (cualquier rol de la óptica).
export async function cambiarCita(datos: FormData): Promise<ResultadoAgenda> {
  return conPerfil(["admin", "clinico", "ventas", "bodega"], async ({ supabase, tenantId }) => {
    const id = String(datos.get("cita_id") ?? "");
    const estado = String(datos.get("estado") ?? "");
    if (!UUID.test(id) || !["agendada", "cancelada", "asistio"].includes(estado)) return { error: "Acción no válida." };
    const r = await supabase.from("citas_operativo").update({ estado }).eq("id", id).eq("tenant_id", tenantId).select("operativo_id").single();
    if (r.error) return { error: r.error.code === "23505" ? "Esa persona ya tiene otra hora vigente en este operativo." : "No se pudo cambiar." };
    revalidatePath(`/operativos/${r.data.operativo_id}`);
    return { mensaje: "Listo" };
  });
}
