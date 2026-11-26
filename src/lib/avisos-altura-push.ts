import "server-only";

import { createHash } from "node:crypto";
import { sendNotification } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

const PUSH_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "web.push.apple.com"]);
const HOST_SUFFIXES = [".notify.windows.com", ".push.apple.com"];

export function endpointDeAvisos(endpoint: string) {
  if (endpoint.length > 2048 || /\s/.test(endpoint)) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && !url.username && !url.password && !url.hash
      && (PUSH_HOSTS.has(url.hostname) || HOST_SUFFIXES.some(sufijo => url.hostname.endsWith(sufijo)));
  } catch {
    return false;
  }
}

export function huellaDispositivo(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function clavePublicaAvisos() {
  if (!process.env.ALTURA_VAPID_PRIVATE_KEY) return "";
  return process.env.ALTURA_VAPID_PUBLIC_KEY ?? "";
}

export async function enviarAvisosAltura(tenantId: string, ventaId: string) {
  const publicKey = clavePublicaAvisos();
  const privateKey = process.env.ALTURA_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;
  // El POS ya validó la óptica y guardó la venta. Las tiendas de dispositivos
  // son privadas y cada consulta se limita a los destinatarios de esa venta.
  const admin = createAdminClient();
  const avisos = await admin.from("avisos_medicion_altura")
    .select("destinatario_id, ventas:venta_id!inner(anulada)").eq("tenant_id", tenantId)
    .eq("venta_id", ventaId).eq("ventas.anulada", false).is("tomada_en", null);
  if (avisos.error || !avisos.data?.length) return;
  let perfiles = admin.from("users").select("id").eq("tenant_id", tenantId).eq("estado", "activo").in("rol", ["admin", "clinico"]);
  if (avisos.data.every(a => a.destinatario_id)) {
    perfiles = perfiles.in("id", [...new Set(avisos.data.map(a => a.destinatario_id))]);
  }
  const { data: usuarios } = await perfiles;
  if (!usuarios?.length) return;
  const dispositivos = await admin.from("dispositivos_avisos_altura")
    .select("huella,endpoint,p256dh,auth").eq("tenant_id", tenantId).in("usuario_id", usuarios.map(u => u.id));
  if (dispositivos.error) return;
  const contenido = JSON.stringify({ tag: ventaId });
  await Promise.all(dispositivos.data.filter(d => endpointDeAvisos(d.endpoint)).map(async d => {
    try {
      await sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, contenido, {
        TTL: 600, urgency: "high", timeout: 4000,
        vapidDetails: { publicKey, privateKey, subject: "https://lentiaapp.cl" },
      });
    } catch (error) {
      const estado = (error as {statusCode?: number})?.statusCode;
      if (estado === 404 || estado === 410) await admin.from("dispositivos_avisos_altura").delete()
        .eq("tenant_id", tenantId).eq("huella", d.huella);
    }
  }));
}
