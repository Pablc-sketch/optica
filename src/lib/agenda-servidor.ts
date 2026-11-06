import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { leerTodas } from "@/lib/leer-todas";
import type { BloqueLibre, EventoAgenda } from "@/lib/agenda";

export async function cargarAgenda(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, desde: string, hasta: string,
) {
  const [propios, bloques, tenant] = await Promise.all([
    leerTodas((a, b) => supabase.from("operativos")
      .select("id,nombre,fecha,fecha_fin,hora_inicio,hora_fin,direccion,notas,estado,agenda_confirmado")
      .eq("tenant_id", tenantId).lte("fecha", hasta)
      .or(`fecha_fin.gte.${desde},and(fecha_fin.is.null,fecha.gte.${desde})`)
      .order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("agenda_bloques")
      .select("id,tipo,nombre,optica,direccion,notas,fecha,fecha_fin,estado")
      .eq("tenant_id", tenantId).lte("fecha", hasta)
      .or(`fecha_fin.gte.${desde},and(fecha_fin.is.null,fecha.gte.${desde})`)
      .order("id").range(a, b)),
    supabase.from("tenants").select("nombre_comercial").eq("id", tenantId).single(),
  ]);
  const nombreOptica = tenant.data?.nombre_comercial ?? "Mi óptica";
  const eventos: EventoAgenda[] = [
    ...(propios.data ?? []).map((o): EventoAgenda => ({
      ...o, tipo: "propio", optica: nombreOptica,
      estado: o.estado === "planificado" ? (o.agenda_confirmado ? "confirmado" : "pendiente") : o.estado,
    })),
    ...(bloques.data ?? []).filter(o => o.tipo === "externo").map((o): EventoAgenda => ({
      ...o, tipo: "externo", nombre: o.nombre ?? "Operativo externo", hora_inicio: null, hora_fin: null,
    })),
  ];
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"));
  const disponibilidad: BloqueLibre[] = (bloques.data ?? []).filter(o => o.tipo === "disponible");
  return { eventos, disponibilidad, nombreOptica, error: propios.error ?? bloques.error ?? tenant.error };
}
