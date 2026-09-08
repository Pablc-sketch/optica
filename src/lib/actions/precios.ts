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

  // El costo de stock se deja vacío cuando el laboratorio no tiene ese
  // cristal hecho para esa receta: ahí no hay dos precios, hay uno solo
  // (el tallado a medida) y el punto de venta lo cobra igual aunque se
  // marque "de stock".
  const stockTexto = String(formData.get("costo_stock") ?? "").trim();
  const costoStock = stockTexto === "" ? null : parsearMonto(formData.get("costo_stock"));

  const { error } = await supabase
    .from("costos_cristales")
    .update({ costo, costo_stock: costoStock, precio_venta: precio })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/precios");
  revalidatePath("/ventas");
}

// Cómo pide el laboratorio este cristal en su catálogo (ej. Fides no
// entiende "Multifocal Filtro Azul", pide el nombre de su lista). El nombre
// no cambia según el rango de la receta — es el mismo producto en distinta
// potencia — así que se escribe una vez y se aplica a todos los rangos de
// ese tipo + tratamiento.
export async function actualizarNombreLaboratorio(formData: FormData) {
  const supabase = await createClient();
  const tipoLente = String(formData.get("tipo_lente") ?? "").trim();
  const tratamiento = String(formData.get("tratamiento") ?? "").trim();
  if (!tipoLente || !tratamiento) return;

  const nombre = String(formData.get("nombre_laboratorio") ?? "").trim() || null;

  const { error } = await supabase
    .from("costos_cristales")
    .update({ nombre_laboratorio: nombre })
    .eq("tipo_lente", tipoLente)
    .eq("tratamiento", tratamiento);
  if (error) throw error;

  revalidatePath("/precios");
  revalidatePath("/laboratorio");
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
