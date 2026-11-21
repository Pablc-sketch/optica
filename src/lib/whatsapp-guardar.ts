import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MensajeChat } from "@/lib/whatsapp-cloud";
import { sugerenciaDeMensaje, type OperativoProximo } from "@/lib/whatsapp-inscripcion";
import { hoyEnChile } from "@/lib/fechas";

// Guarda la copia de los mensajes de WhatsApp y, si un mensaje es una
// inscripción, deja la sugerencia «por confirmar». La óptica sale del número
// de Meta que recibió el mensaje. La detección es con reglas, aquí mismo:
// nada del chat sale de Lentia. Cada mensaje se guarda una sola vez aunque
// Meta reenvíe el aviso (la base lo garantiza en registrar_mensaje_whatsapp).

// Los chats se guardan 6 meses; después se borran solos.
export const DIAS_RETENCION = 180;

type Db = ReturnType<typeof createAdminClient>;

async function operativosProximos(db: Db, tenant: string): Promise<OperativoProximo[]> {
  const hoy = hoyEnChile();
  const r = await db.from("operativos").select("id, nombre, fecha, fecha_fin, comuna, direccion, sectores")
    .eq("tenant_id", tenant).eq("estado", "planificado").or(`fecha.gte.${hoy},fecha_fin.gte.${hoy}`)
    .order("fecha").order("id").limit(60);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as OperativoProximo[];
}

export async function guardarMensajes(mensajes: MensajeChat[], db: Db = createAdminClient()): Promise<string[]> {
  const resultados: string[] = [];
  // Óptica y operativos próximos de cada número (se leen una vez por aviso).
  const porNumero = new Map<string, { tenant: string; ops: OperativoProximo[] } | null>();
  for (const m of mensajes.slice(0, 500)) {
    try {
      if (!porNumero.has(m.phoneNumberId)) {
        const n = await db.from("whatsapp_numeros").select("tenant_id, activo").eq("phone_number_id", m.phoneNumberId).maybeSingle();
        const tenant = n.data?.activo ? (n.data.tenant_id as string) : null;
        porNumero.set(m.phoneNumberId, tenant ? { tenant, ops: await operativosProximos(db, tenant) } : null);
      }
      const numero = porNumero.get(m.phoneNumberId);
      if (!numero) { resultados.push("sin_numero"); continue; }
      const sugerencia = m.direccion === "entrante" ? sugerenciaDeMensaje(m.texto, m.nombrePerfil, numero.ops) : null;
      const r = await db.rpc("registrar_mensaje_whatsapp", {
        p_phone_number_id: m.phoneNumberId,
        p_telefono: m.telefono,
        p_nombre_perfil: m.nombrePerfil,
        p_wamid: m.wamid,
        p_direccion: m.direccion,
        p_texto: m.texto,
        p_enviado_en: m.enviadoEn,
        p_sugerencia: sugerencia,
      });
      if (r.error) throw new Error(r.error.message);
      resultados.push(String(r.data));
    } catch (e) {
      resultados.push("error");
      console.error("whatsapp: no se pudo guardar un mensaje", e instanceof Error ? e.message : "error");
    }
  }
  // Limpieza de vez en cuando.
  if (Math.random() < 0.02) {
    const limite = new Date(Date.now() - DIAS_RETENCION * 86400000).toISOString();
    for (const x of porNumero.values()) {
      if (x) await db.from("whatsapp_mensajes").delete().eq("tenant_id", x.tenant).lt("enviado_en", limite);
    }
  }
  return resultados;
}
