import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodas } from "@/lib/leer-todas";
import { filasRentabilidad, type FilaRentabilidad, type OperativoRentabilidad, type VentaRentabilidad } from "@/lib/rentabilidad-operativos";

// Datos que el asistente puede ver. Se leen SIEMPRE con la sesión del usuario
// (RLS deja ver solo su óptica) y además filtrando por su tenant. Solo salen
// totales por operativo: nunca nombres, RUT, teléfonos, recetas ni
// diagnósticos de pacientes.

export type OperativoIA = OperativoRentabilidad & {
  fecha_fin: string | null;
  direccion: string | null;
  comuna: string | null;
  region: string | null;
  hora_inicio: string | null;
  hora_fin: string | null;
  meta_examenes: number | null;
};

const COLUMNAS =
  "id, nombre, tipo_venue, fecha, fecha_fin, estado, direccion, comuna, region, hora_inicio, hora_fin, meta_examenes, " +
  "costo_transporte, costo_arriendo, costo_viaticos, costo_otros, costo_ayudante, costo_equipos, costo_hospedaje, costo_comida, costo_peajes, costo_marco_unitario";

export async function leerRentabilidad(supabase: SupabaseClient, tenantId: string): Promise<FilaRentabilidad<OperativoIA>[]> {
  const [ops, recetas, ventas] = await Promise.all([
    leerTodas<OperativoIA>((a, b) =>
      supabase.from("operativos").select(COLUMNAS).eq("tenant_id", tenantId).order("fecha", { ascending: false }).order("id").range(a, b) as never
    ),
    leerTodas<{ operativo_id: string | null; paciente_id: string | null }>((a, b) =>
      supabase.from("recetas").select("id, operativo_id, paciente_id").eq("tenant_id", tenantId).not("operativo_id", "is", null).order("id").range(a, b) as never
    ),
    leerTodas<VentaRentabilidad>((a, b) =>
      supabase
        .from("ventas")
        .select(
          `id, operativo_id, total, paciente_id,
           venta_items (cantidad, cristal_slot, ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2), productos:producto_id (costo, categoria))`
        )
        .eq("tenant_id", tenantId)
        .eq("anulada", false)
        .not("operativo_id", "is", null)
        .order("id")
        .range(a, b) as never
    ),
  ]);
  if (ops.error || recetas.error || ventas.error) throw new Error("No se pudieron leer los operativos");
  return filasRentabilidad(ops.data ?? [], recetas.data ?? [], ventas.data ?? []);
}

// Cuántas horas tomadas tiene cada operativo (solo el número).
export async function contarCitas(supabase: SupabaseClient, tenantId: string): Promise<Map<string, number>> {
  const r = await leerTodas<{ operativo_id: string }>((a, b) =>
    supabase.from("citas_operativo").select("id, operativo_id").eq("tenant_id", tenantId).eq("estado", "agendada").order("id").range(a, b) as never
  );
  const m = new Map<string, number>();
  // Si la tabla aún no existe (migración pendiente) el asistente sigue sin citas.
  for (const c of r.data ?? []) m.set(c.operativo_id, (m.get(c.operativo_id) ?? 0) + 1);
  return m;
}
