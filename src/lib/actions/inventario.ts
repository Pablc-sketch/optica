"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// El stock nunca se escribe a mano: se registra un movimiento y el trigger
// trg_movimiento_stock lo aplica. Así queda historial de por qué cambió.
export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");

  const productoId = String(formData.get("producto_id"));
  const sucursalId = String(formData.get("sucursal_id"));
  const tipo = String(formData.get("tipo"));
  const cantidad = Math.round(Number(formData.get("cantidad")));
  const referencia = String(formData.get("referencia") ?? "").trim() || null;

  if (!["entrada", "salida", "ajuste"].includes(tipo)) return;
  if (!Number.isFinite(cantidad) || cantidad === 0) return;
  // Entrada y salida se registran en positivo; el ajuste admite negativo
  // para corregir un conteo hacia abajo.
  if (tipo !== "ajuste" && cantidad < 0) return;

  const { error } = await supabase.from("movimientos_inventario").insert({
    tenant_id: perfil.tenant_id,
    producto_id: productoId,
    sucursal_id: sucursalId,
    tipo,
    cantidad,
    referencia,
  });
  if (error) throw error;

  revalidatePath("/inventario");
  revalidatePath("/");
}

export async function actualizarStockMinimo(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("inventario_id"));
  const minimo = Math.round(Number(formData.get("stock_minimo")));
  if (!Number.isFinite(minimo) || minimo < 0) return;

  const { error } = await supabase.from("inventario").update({ stock_minimo: minimo }).eq("id", id);
  if (error) throw error;
  revalidatePath("/inventario");
}
