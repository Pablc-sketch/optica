"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const SIGUIENTE: Record<string, string> = {
  recepcion: "laboratorio",
  laboratorio: "montaje",
  montaje: "listo",
  listo: "entregado",
};

export async function avanzarOT(formData: FormData) {
  const supabase = await createClient();
  const otId = String(formData.get("ot_id"));
  const estadoActual = String(formData.get("estado_actual"));

  const siguiente = SIGUIENTE[estadoActual];
  if (!siguiente) return;

  const cambios: Record<string, unknown> = { estado: siguiente };
  if (siguiente === "entregado") cambios.fecha_entrega_real = new Date().toISOString();

  // RLS garantiza que solo se puede tocar una OT del propio tenant.
  const { error } = await supabase.from("ordenes_trabajo").update(cambios).eq("id", otId);
  if (error) throw error;

  revalidatePath("/ot");
  revalidatePath("/");
}
