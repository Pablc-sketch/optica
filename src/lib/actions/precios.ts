"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function parsearMonto(valor: FormDataEntryValue | null): number | null {
  const n = Math.round(Number(String(valor ?? "").replace(/\./g, "").replace(",", ".")));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

// Costo (lo que cobra el laboratorio) y precio de venta de cada combinación
// tipo de lente x rango x tratamiento. El costo llega precargado desde una
// plantilla genérica al registrar la óptica (spec: sirve de punto de
// partida), pero cada óptica puede usar un laboratorio distinto — sin poder
// editarlo acá, la utilidad de los reportes queda calculada con el costo
// de otro laboratorio, no el real.
// RLS limita el update al tenant del usuario autenticado.
export async function actualizarCostoCristal(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const costo = parsearMonto(formData.get("costo"));
  const precio = parsearMonto(formData.get("precio"));
  if (costo === null || precio === null) return;

  const { error } = await supabase.from("costos_cristales").update({ costo, precio_venta: precio }).eq("id", id);
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
