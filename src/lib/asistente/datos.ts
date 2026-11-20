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
  sectores: string | null;
};

const COLUMNAS =
  "id, nombre, tipo_venue, fecha, fecha_fin, estado, direccion, comuna, region, hora_inicio, hora_fin, meta_examenes, sectores, " +
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

// Cuántas personas inscritas (vigentes) tiene cada operativo (solo el número).
export async function contarInscritos(supabase: SupabaseClient, tenantId: string): Promise<Map<string, number>> {
  const r = await leerTodas<{ operativo_id: string }>((a, b) =>
    supabase.from("inscritos_operativo").select("id, operativo_id").eq("tenant_id", tenantId).in("estado", ["inscrito", "asistio"]).order("id").range(a, b) as never
  );
  const m = new Map<string, number>();
  // Si la tabla aún no existe (migración pendiente) se sigue sin inscritos.
  for (const c of r.data ?? []) m.set(c.operativo_id, (m.get(c.operativo_id) ?? 0) + 1);
  return m;
}

// Operativos que tienen al menos un contacto (dirigente) anotado.
export async function operativosConContacto(supabase: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const r = await leerTodas<{ operativo_id: string }>((a, b) =>
    supabase.from("contactos_operativo").select("id, operativo_id").eq("tenant_id", tenantId).order("id").range(a, b) as never
  );
  return new Set((r.data ?? []).map((c) => c.operativo_id));
}

// Direcciones de las sucursales: desde dónde sale el equipo.
export async function leerBases(supabase: SupabaseClient, tenantId: string): Promise<string[]> {
  const r = await supabase.from("sucursales").select("nombre, direccion").eq("tenant_id", tenantId).limit(10);
  return (r.data ?? []).map((x: { nombre: string; direccion: string | null }) => [x.nombre, x.direccion].filter(Boolean).join(": "));
}
