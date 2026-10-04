"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";

const SIGUIENTE: Record<string, string> = {
  recepcion: "laboratorio",
  laboratorio: "montaje",
  montaje: "listo",
  listo: "entregado",
};

const ANTERIOR: Record<string, string> = {
  laboratorio: "recepcion",
  montaje: "laboratorio",
  listo: "montaje",
  entregado: "listo",
};

// El cambio se aplica solo si la OT sigue en el estado que se vio en
// pantalla: si otra persona ya la avanzó, no se salta una etapa ni se
// deshace su cambio con un formulario viejo (A05).
async function moverOT(formData: FormData, direccion: "avanzar" | "retroceder") {
  const { supabase } = await requerirPerfil({ roles: ["admin", "clinico", "ventas", "bodega"], suscripcion: true });
  const otId = String(formData.get("ot_id"));
  const estadoVisto = String(formData.get("estado_actual"));
  const destino = direccion === "avanzar" ? SIGUIENTE[estadoVisto] : ANTERIOR[estadoVisto];
  if (!destino) return;

  const cambios: Record<string, unknown> = { estado: destino };
  if (destino === "entregado") cambios.fecha_entrega_real = new Date().toISOString();
  if (direccion === "retroceder" && estadoVisto === "entregado") cambios.fecha_entrega_real = null;

  const { data, error } = await supabase
    .from("ordenes_trabajo")
    .update(cambios)
    .eq("id", otId)
    .eq("estado", estadoVisto)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Esta orden cambió de estado mientras la tenías abierta. Recarga la página.");
  }

  revalidatePath("/ot");
  revalidatePath("/");
}

export async function avanzarOT(formData: FormData) {
  await moverOT(formData, "avanzar");
}

// Deshacer un "avanzar" apretado por error (pasa harto en un operativo con
// apuro, atendiendo a muchas personas seguidas) — vuelve una columna atrás
// sin tener que borrar la OT ni pedirle ayuda a nadie.
export async function retrocederOT(formData: FormData) {
  await moverOT(formData, "retroceder");
}

// Solo "lejos" o "cerca" son válidos; cualquier otra cosa (incluido vacío)
// queda como null = sin definir, que es lo correcto para Bifocal/Multifocal
// (un solo cristal cubre las dos distancias).
function parsearPosicion(valor: FormDataEntryValue | null): "lejos" | "cerca" | null {
  const v = String(valor ?? "").trim();
  return v === "lejos" || v === "cerca" ? v : null;
}

// Corregir un error de tipeo sin tener que anular y rehacer toda la venta:
// marco, si el cristal es de lejos o de cerca, origen (stock/laboratorio),
// laboratorio, fecha estimada y notas. El tipo de lente/tratamiento/costo no
// se tocan acá — están ligados al precio cobrado en la venta, así que un
// cambio de lente pasa por anular y rehacer (o "Editar" en la venta, para
// ajustar solo el monto).
function parsearOrigen(valor: FormDataEntryValue | null): "stock" | "laboratorio" {
  return String(valor ?? "") === "stock" ? "stock" : "laboratorio";
}

export async function actualizarOT(formData: FormData) {
  const supabase = await createClient();
  const otId = String(formData.get("ot_id"));

  // Si el paciente trae su propio marco, no importa lo que haya quedado
  // seleccionado en el desplegable — ese cristal no lleva ningún producto
  // de nuestro stock.
  const marcoPropio = formData.get("marco_propio") === "on";
  const marcoPropio2 = formData.get("marco_propio_2") === "on";

  // Si la orden ya tiene venta, el marco es parte de lo vendido: cambiarlo
  // acá dejaba el ítem de venta y el stock con el marco anterior (A06). En
  // ese caso los marcos no se tocan desde la OT; se corrigen anulando y
  // rehaciendo la venta.
  const { count: itemsVenta } = await supabase
    .from("venta_items")
    .select("id", { count: "exact", head: true })
    .eq("ot_id", otId);
  const marcos =
    (itemsVenta ?? 0) > 0
      ? {}
      : {
          armazon_producto_id: marcoPropio ? null : String(formData.get("armazon_producto_id") ?? "").trim() || null,
          marco_propio: marcoPropio,
          armazon_producto_id_2: marcoPropio2 ? null : String(formData.get("armazon_producto_id_2") ?? "").trim() || null,
          marco_propio_2: marcoPropio2,
        };

  const { error } = await supabase
    .from("ordenes_trabajo")
    .update({
      ...marcos,
      // La descripción del marco no mueve stock: se puede corregir siempre,
      // también en órdenes con venta (ej. una que quedó "sin marco").
      marco_descripcion: String(formData.get("marco_descripcion") ?? "").trim().slice(0, 120) || null,
      marco_descripcion_2: String(formData.get("marco_descripcion_2") ?? "").trim().slice(0, 120) || null,
      posicion: parsearPosicion(formData.get("posicion")),
      posicion_2: parsearPosicion(formData.get("posicion_2")),
      origen_cristal: parsearOrigen(formData.get("origen_cristal")),
      // El segundo cristal puede salir de otro lado que el primero (lejos de
      // stock, cerca tallado): se corrige por separado, y solo si la orden
      // tiene segundo cristal — si no, el formulario no lo manda y no se toca.
      ...(formData.has("origen_cristal_2") ? { origen_cristal_2: parsearOrigen(formData.get("origen_cristal_2")) } : {}),
      proveedor_lab_id: String(formData.get("proveedor_lab_id") ?? "").trim() || null,
      fecha_entrega_estimada: String(formData.get("fecha_entrega_estimada") ?? "").trim() || null,
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .eq("id", otId);
  if (error) throw error;

  revalidatePath(`/ot/${otId}`);
  revalidatePath("/ot");
  revalidatePath("/laboratorio");
  revalidatePath("/");
}

// La OT nace siempre junto con la venta que la generó (registrarVenta las
// crea en el mismo paso), así que borrar solo la fila de la OT chocaría con
// la referencia desde venta_items (23503) o dejaría la venta con un ítem
// fantasma. Si ya se cobró algo (hay pagos_abonos) no se toca nada: es
// plata real y hay que conservar el comprobante, igual que con pacientes.
// Si no se ha cobrado nada, se puede deshacer todo el error: se revierte el
// stock que salió con esa venta, se borra la venta completa y la OT.
export async function eliminarOT(formData: FormData) {
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message };
    throw e;
  }
  const otId = String(formData.get("ot_id"));

  // Una transacción: devuelve el stock neto (venta + ediciones) y borra
  // OT, ítems y venta juntos; con pagos registrados se niega (A06).
  const { error } = await supabase.rpc("eliminar_venta_de_ot", { p_ot_id: otId });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/ot");
  revalidatePath("/ventas");
  revalidatePath("/laboratorio");
  revalidatePath("/reportes");
  revalidatePath("/");
  return { ok: true as const };
}
