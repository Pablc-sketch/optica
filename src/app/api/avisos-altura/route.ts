import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { COOKIE_AVISOS_ALTURA, tipoConAltura, type AvisoAltura } from "@/lib/avisos-altura";
import { clavePublicaAvisos, endpointDeAvisos, huellaDispositivo } from "@/lib/avisos-altura-push";

type OT = {
  id: string;
  folio: number;
  tipo_lente: string | null;
  tipo_lente_2: string | null;
  paciente: { nombre: string } | null;
  operativo: { nombre: string } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const respuesta = (data: unknown, status = 200) => NextResponse.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
const fallo = (error: string, status: number) => respuesta({ error }, status);

export async function GET() {
  try {
    const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin", "clinico"] });
    const huella = (await cookies()).get(COOKIE_AVISOS_ALTURA)?.value;
    const [lista, dispositivo] = await Promise.all([
      supabase.from("avisos_medicion_altura").select(
        "id,par,orden:ot_id!inner(id,folio,tipo_lente,tipo_lente_2,estado,paciente:paciente_id(nombre),operativo:operativo_id(nombre)),venta:venta_id!inner(anulada)"
      ).eq("tenant_id", tenantId).eq("venta.anulada", false).not("orden.estado", "in", "(cancelado,entregado)")
        .is("tomada_en", null).order("creado_en", { ascending: false }).order("id").limit(80),
      huella ? supabase.from("dispositivos_avisos_altura").select("huella")
        .eq("tenant_id", tenantId).eq("usuario_id", user.id).eq("huella", huella).maybeSingle() : null,
    ]);
    if (lista.error) return fallo("No se pudieron cargar los avisos.", 503);
    const avisos: AvisoAltura[] = lista.data.flatMap(fila => {
      const orden = fila.orden as unknown as OT | null;
      const tipo = tipoConAltura(fila.par === 2 ? orden?.tipo_lente_2 : orden?.tipo_lente);
      return orden && tipo ? [{
        id: fila.id, par: fila.par, otId: orden.id, folio: orden.folio, tipo,
        paciente: orden.paciente?.nombre ?? "Paciente de la OT", sede: orden.operativo?.nombre ?? null,
      }] : [];
    });
    return respuesta({ avisos, pushActivo: Boolean(dispositivo?.data) });
  } catch (error) {
    if (error instanceof SinPermiso) return fallo(error.message, 403);
    throw error;
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return fallo("Solicitud inválida.", 415);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return fallo("Solicitud inválida.", 400);
  try {
    const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin", "clinico"], suscripcion: true });
    if (body.accion === "tomada") {
      if (typeof body.id !== "string" || !UUID.test(body.id)) return fallo("Aviso inválido.", 400);
      const { data, error } = await supabase.from("avisos_medicion_altura")
        .update({ tomada_en: new Date().toISOString(), tomada_por: user.id })
        .eq("tenant_id", tenantId).eq("id", body.id).is("tomada_en", null).select("id").maybeSingle();
      if (error) return fallo("No se pudo confirmar la altura.", 503);
      if (!data) {
        const confirmado = await supabase.from("avisos_medicion_altura").select("tomada_en")
          .eq("tenant_id", tenantId).eq("id", body.id).maybeSingle();
        if (!confirmado.data?.tomada_en) return fallo("El aviso ya no está disponible.", 404);
      }
      return respuesta({ ok: true });
    }
    const jar = await cookies();
    if (body.accion === "desactivar") {
      const huella = jar.get(COOKIE_AVISOS_ALTURA)?.value;
      if (huella) {
        const { error } = await supabase.from("dispositivos_avisos_altura").delete()
          .eq("tenant_id", tenantId).eq("usuario_id", user.id).eq("huella", huella);
        if (error) return fallo("No se pudo desactivar el dispositivo.", 503);
      }
      jar.delete(COOKIE_AVISOS_ALTURA);
      return respuesta({ ok: true });
    }
    if (body.accion !== "activar") return fallo("Solicitud inválida.", 400);
    if (!clavePublicaAvisos()) return fallo("Los avisos del teléfono no están disponibles.", 503);
    const endpoint = body.suscripcion?.endpoint;
    const p256dh = String(body.suscripcion?.keys?.p256dh ?? "").replace(/=+$/, "");
    const auth = String(body.suscripcion?.keys?.auth ?? "").replace(/=+$/, "");
    if (typeof endpoint !== "string" || !endpointDeAvisos(endpoint) || !/^[A-Za-z0-9_-]{87}$/.test(p256dh)
      || !/^[A-Za-z0-9_-]{22}$/.test(auth)) return fallo("No se pudo validar el dispositivo.", 400);
    const huella = huellaDispositivo(endpoint);
    const { error } = await supabase.from("dispositivos_avisos_altura").upsert({
      tenant_id: tenantId, usuario_id: user.id, huella, endpoint, p256dh, auth,
    }, { onConflict: "huella" });
    if (error) return fallo("No se pudo activar el dispositivo. Vuelve a intentarlo.", 503);
    jar.set(COOKIE_AVISOS_ALTURA, huella, {
      httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60,
    });
    return respuesta({ ok: true });
  } catch (error) {
    if (error instanceof SinPermiso) return fallo(error.message, 403);
    throw error;
  }
}
