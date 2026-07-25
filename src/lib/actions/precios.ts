"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parsearMonto(valor: FormDataEntryValue | null): number | null {
  const n = Math.round(Number(String(valor ?? "").replace(/\./g, "").replace(",", ".")));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// RLS limita ambos updates al tenant del usuario autenticado.
export async function actualizarPrecioCristal(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const precio = parsearMonto(formData.get("precio"));
  if (precio === null) return;

  const { error } = await supabase.from("costos_cristales").update({ precio_venta: precio }).eq("id", id);
  if (error) throw error;
  revalidatePath("/precios");
  revalidatePath("/ventas");
}

export async function actualizarPrecioProducto(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const precio = parsearMonto(formData.get("precio"));
  if (precio === null) return;

  const { error } = await supabase.from("productos").update({ precio_venta: precio }).eq("id", id);
  if (error) throw error;
  revalidatePath("/precios");
  revalidatePath("/ventas");
}
