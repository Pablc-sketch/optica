import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MensajeChat } from "@/lib/whatsapp-cloud";

// Guarda la copia de los mensajes de WhatsApp en la bandeja de cada óptica.
// La óptica sale del número de Meta que recibió el mensaje.

// Los chats se guardan 6 meses; después se borran solos.
export const DIAS_RETENCION = 180;

export async function guardarMensajes(mensajes: MensajeChat[]) {
  const db = createAdminClient();
  const tenants = new Map<string, string | null>();
  for (const m of mensajes.slice(0, 500)) {
    try {
      if (!tenants.has(m.phoneNumberId)) {
        const n = await db.from("whatsapp_numeros").select("tenant_id, activo").eq("phone_number_id", m.phoneNumberId).maybeSingle();
        tenants.set(m.phoneNumberId, n.data?.activo ? (n.data.tenant_id as string) : null);
      }
      const tenant = tenants.get(m.phoneNumberId);
      if (!tenant) continue;
      // El chat primero (el mensaje lo referencia). Fechas solo hacia adelante.
      const actual = await db.from("whatsapp_chats").select("ultimo_mensaje_en, ultimo_entrante_en, nombre_perfil, estado")
        .eq("tenant_id", tenant).eq("telefono", m.telefono).maybeSingle();
      const posterior = (a: string | null | undefined) => (!a || m.enviadoEn > a ? m.enviadoEn : a);
      const chat = {
        tenant_id: tenant,
        telefono: m.telefono,
        nombre_perfil: m.nombrePerfil ?? actual.data?.nombre_perfil ?? null,
        ultimo_mensaje_en: posterior(actual.data?.ultimo_mensaje_en),
        ultimo_entrante_en: m.direccion === "entrante" ? posterior(actual.data?.ultimo_entrante_en) : actual.data?.ultimo_entrante_en ?? null,
        // Si una persona ya descartada vuelve a escribir, vuelve a la bandeja.
        estado: actual.data?.estado === "descartado" && m.direccion === "entrante" ? "pendiente" : actual.data?.estado ?? "pendiente",
      };
      const c = await db.from("whatsapp_chats").upsert(chat);
      if (c.error) throw new Error(c.error.message);
      // wamid único: si Meta reintenta el aviso, no se duplica.
      const r = await db.from("whatsapp_mensajes").upsert(
        { tenant_id: tenant, telefono: m.telefono, wamid: m.wamid, direccion: m.direccion, texto: m.texto, enviado_en: m.enviadoEn },
        { onConflict: "wamid", ignoreDuplicates: true }
      );
      if (r.error) throw new Error(r.error.message);
    } catch (e) {
      console.error("whatsapp: no se pudo guardar un mensaje", e instanceof Error ? e.message : "error");
    }
  }
  // Limpieza de vez en cuando.
  if (Math.random() < 0.02) {
    const limite = new Date(Date.now() - DIAS_RETENCION * 86400000).toISOString();
    for (const t of new Set([...tenants.values()].filter((x): x is string => Boolean(x)))) {
      await db.from("whatsapp_mensajes").delete().eq("tenant_id", t).lt("enviado_en", limite);
    }
  }
}
