import type { SupabaseClient } from "@supabase/supabase-js";

// Inscribe personas en un operativo. La misma persona (teléfono + nombre)
// no puede quedar dos veces; si se había quitado, se reactiva en vez de
// crear otra fila (la base guarda una sola por persona y operativo).

export type FilaInscrito = {
  tenant_id: string;
  operativo_id: string;
  nombre: string;
  telefono: string;
  edad: number | null;
  estado: "por_confirmar" | "inscrito";
  origen: "whatsapp" | "manual";
  sector?: string | null;
  motivo?: string | null;
  creado_por?: string | null;
};

export type ResultadoInscribir = { nombre: string; ok: true } | { nombre: string; ok: false; repetida: boolean };

export async function inscribir(db: SupabaseClient, filas: FilaInscrito[]): Promise<ResultadoInscribir[]> {
  const out: ResultadoInscribir[] = [];
  for (const f of filas) {
    const r = await db.from("inscritos_operativo").insert(f);
    if (!r.error) { out.push({ nombre: f.nombre, ok: true }); continue; }
    if (r.error.code !== "23505") { out.push({ nombre: f.nombre, ok: false, repetida: false }); continue; }
    // Ya existe: solo se reactiva si estaba quitada.
    const re = await db.from("inscritos_operativo")
      .update({ estado: f.estado, edad: f.edad, llego: false })
      .eq("tenant_id", f.tenant_id).eq("operativo_id", f.operativo_id).eq("telefono", f.telefono)
      .eq("nombre_clave", f.nombre.trim().toLowerCase()).eq("estado", "cancelado")
      .select("id");
    out.push((re.data ?? []).length > 0 ? { nombre: f.nombre, ok: true } : { nombre: f.nombre, ok: false, repetida: true });
  }
  return out;
}
