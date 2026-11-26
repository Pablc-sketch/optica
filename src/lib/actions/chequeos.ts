"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPerfil } from "@/lib/autorizacion";
import { fechaValidaDocumento } from "@/lib/fecha-documentos";

export async function guardarChequeo(_estado: string, form: FormData): Promise<string> {
  const { supabase } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const id = String(form.get("id") ?? "");
  const nombre = String(form.get("nombre") ?? "").trim();
  const desde = String(form.get("desde") ?? "");
  const hasta = String(form.get("hasta") ?? "");
  const ahorro = Number(form.get("ahorro_pct"));
  const sedes = [...new Set(form.getAll("sede").map(String))];
  if (!nombre || nombre.length > 100 || !fechaValidaDocumento(desde) || !fechaValidaDocumento(hasta)
      || desde > hasta || !Number.isFinite(ahorro) || ahorro < 0 || ahorro > 100) return "Revisa el nombre, las fechas y el porcentaje de ahorro.";
  const { data, error } = await supabase.rpc("guardar_chequeo", {
    p_id: id || null, p_nombre: nombre, p_desde: desde, p_hasta: hasta, p_ahorro: ahorro, p_sedes: sedes,
  });
  if (error?.code === "22023") return error.message;
  if (error?.code === "23505") return "Ya existe un chequeo con ese nombre y fechas.";
  if (error || !data) return "No se pudo guardar el chequeo. Intenta de nuevo.";
  revalidatePath("/operativos", "layout");
  revalidatePath("/caja");
  revalidatePath("/entregas");
  redirect(`/operativos/chequeos?chequeo=${data}`);
}
