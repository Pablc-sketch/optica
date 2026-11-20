import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { contarInscritos, leerRentabilidad, operativosConContacto } from "@/lib/asistente/datos";
import { pendientesDeOperativos } from "@/lib/pendientes-operativos";
import { hoyEnChile } from "@/lib/fechas";

// Lo que les falta a los operativos, para el panel del asistente. Reglas
// fijas, sin IA: no gasta consultas.
export const runtime = "nodejs";

export async function GET() {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"] });
    const [filas, inscritos, contactos, porConfirmar] = await Promise.all([
      leerRentabilidad(supabase, tenantId),
      contarInscritos(supabase, tenantId),
      operativosConContacto(supabase, tenantId),
      // Personas que la IA anotó desde WhatsApp y esperan un sí o un no.
      supabase.from("inscritos_operativo").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("estado", "por_confirmar"),
    ]);
    return Response.json({
      pendientes: pendientesDeOperativos(filas, inscritos, hoyEnChile(), contactos).slice(0, 30),
      por_confirmar: porConfirmar.count ?? 0,
    });
  } catch (e) {
    if (e instanceof SinPermiso) return Response.json({ error: e.message }, { status: 403 });
    return Response.json({ error: "No se pudo revisar" }, { status: 503 });
  }
}
