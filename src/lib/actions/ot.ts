"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";

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

// La OT nace siempre junto con la venta que la generó (registrarVenta las
// crea en el mismo paso), así que borrar solo la fila de la OT chocaría con
// la referencia desde venta_items (23503) o dejaría la venta con un ítem
// fantasma. Si ya se cobró algo (hay pagos_abonos) no se toca nada: es
// plata real y hay que conservar el comprobante, igual que con pacientes.
// Si no se ha cobrado nada, se puede deshacer todo el error: se revierte el
// stock que salió con esa venta, se borra la venta completa y la OT.
export async function eliminarOT(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  const tenantId = perfil.tenant_id as string;

  const otId = String(formData.get("ot_id"));

  const { data: itemsOT, error: itemsError } = await supabase
    .from("venta_items")
    .select("venta_id")
    .eq("ot_id", otId);
  if (itemsError) throw itemsError;

  const ventaId = itemsOT?.[0]?.venta_id as string | undefined;

  if (!ventaId) {
    // OT sin venta asociada (caso raro): se borra directo.
    const { error } = await supabase.from("ordenes_trabajo").delete().eq("id", otId);
    if (error) return { ok: false as const, error: "No se pudo eliminar la orden de trabajo." };
    revalidatePath("/ot");
    revalidatePath("/");
    return { ok: true as const };
  }

  const [{ data: pagos }, { data: venta }] = await Promise.all([
    supabase.from("pagos_abonos").select("monto").eq("venta_id", ventaId),
    supabase.from("ventas").select("total").eq("id", ventaId).single(),
  ]);

  if (pagos && pagos.length > 0) {
    return {
      ok: false as const,
      error: `No se puede eliminar: la venta asociada a esta orden (${venta ? clp(venta.total) : ""}) ya tiene pagos registrados. Es un comprobante que hay que conservar.`,
    };
  }

  // Devolver al stock lo que salió con esa venta, antes de borrar todo.
  const { data: movimientos } = await supabase
    .from("movimientos_inventario")
    .select("producto_id, sucursal_id, cantidad, tipo")
    .eq("referencia", `venta:${ventaId}`);

  for (const m of movimientos ?? []) {
    if (m.tipo !== "salida") continue;
    const { error: devError } = await supabase.from("movimientos_inventario").insert({
      tenant_id: tenantId,
      producto_id: m.producto_id,
      sucursal_id: m.sucursal_id,
      tipo: "entrada",
      cantidad: m.cantidad,
      referencia: `anulacion_ot:${otId}`,
    });
    if (devError) throw devError;
  }

  const { error: itemsDelError } = await supabase.from("venta_items").delete().eq("venta_id", ventaId);
  if (itemsDelError) throw itemsDelError;

  const { error: ventaDelError } = await supabase.from("ventas").delete().eq("id", ventaId);
  if (ventaDelError) throw ventaDelError;

  const { error: otDelError } = await supabase.from("ordenes_trabajo").delete().eq("id", otId);
  if (otDelError) throw otDelError;

  revalidatePath("/ot");
  revalidatePath("/ventas");
  revalidatePath("/laboratorio");
  revalidatePath("/reportes");
  revalidatePath("/");
  return { ok: true as const };
}
