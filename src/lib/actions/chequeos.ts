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

export async function guardarRepartoChequeo(_estado: { error?: string }, form: FormData): Promise<{ error?: string }> {
  const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const id = String(form.get("chequeo_id") ?? "");
  const valores = ["comision_isadora_pct", "ahorro_pct", "reparto_pamela_pct"].map(clave => {
    const texto = String(form.get(clave) ?? "").trim().replace(",", ".");
    return /^\d{1,3}(?:\.\d{1,2})?$/.test(texto) ? Number(texto) : NaN;
  });
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) ||
      valores.some(valor => !Number.isFinite(valor) || valor < 0 || valor > 100)) {
    return { error: "Ingresa porcentajes entre 0 y 100." };
  }
  const [comision_isadora_pct, ahorro_pct, reparto_pamela_pct] = valores;
  const { data, error } = await supabase.from("chequeos").update({ comision_isadora_pct, ahorro_pct, reparto_pamela_pct })
    .eq("tenant_id", tenantId).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "No se pudo guardar el reparto." };
  revalidatePath("/operativos/chequeos");
  revalidatePath("/caja");
  redirect(`/caja?chequeo=${id}&guardado=1#reparto`);
}
