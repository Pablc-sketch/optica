"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ItemVenta = {
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
};

export async function registrarVenta(input: {
  pacienteId: string | null;
  items: ItemVenta[];
  abonoInicial: number;
  medioPago: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  const tenantId = perfil.tenant_id as string;

  const items = input.items.filter((i) => i.cantidad > 0 && i.precioUnitario >= 0);
  if (items.length === 0) return { ok: false, error: "La venta no tiene ítems." };

  const total = items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
  const abono = Math.max(0, Math.min(input.abonoInicial, total));
  const estadoPago = abono >= total ? "pagada" : abono > 0 ? "abono_parcial" : "pendiente";

  const { data: venta, error: ventaError } = await supabase
    .from("ventas")
    .insert({
      tenant_id: tenantId,
      paciente_id: input.pacienteId,
      vendedor_id: user.id,
      total,
      estado_pago: estadoPago,
    })
    .select("id")
    .single();
  if (ventaError) throw ventaError;

  const { error: itemsError } = await supabase.from("venta_items").insert(
    items.map((i) => ({
      tenant_id: tenantId,
      venta_id: venta.id,
      producto_id: i.productoId ?? null,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      precio_unitario: i.precioUnitario,
    }))
  );
  if (itemsError) throw itemsError;

  if (abono > 0) {
    const { error: pagoError } = await supabase.from("pagos_abonos").insert({
      tenant_id: tenantId,
      venta_id: venta.id,
      monto: abono,
      medio_pago: input.medioPago,
    });
    if (pagoError) throw pagoError;
  }

  // Salida de inventario por ítem físico; el trigger trg_movimiento_stock
  // aplica el descuento sobre inventario.stock_actual.
  for (const item of items) {
    if (!item.productoId) continue;
    const { data: inv } = await supabase
      .from("inventario")
      .select("sucursal_id")
      .eq("producto_id", item.productoId)
      .limit(1)
      .maybeSingle();
    if (!inv) continue;

    await supabase.from("movimientos_inventario").insert({
      tenant_id: tenantId,
      producto_id: item.productoId,
      sucursal_id: inv.sucursal_id,
      tipo: "salida",
      cantidad: item.cantidad,
      referencia: `venta:${venta.id}`,
    });
  }

  revalidatePath("/ventas");
  revalidatePath("/");
  return { ok: true, ventaId: venta.id as string };
}

export async function registrarAbono(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");

  const ventaId = String(formData.get("venta_id"));
  const monto = Math.round(Number(String(formData.get("monto")).replace(/\./g, "")));
  const medioPago = String(formData.get("medio_pago") ?? "efectivo");
  if (!monto || monto <= 0) return;

  const { error: pagoError } = await supabase.from("pagos_abonos").insert({
    tenant_id: perfil.tenant_id,
    venta_id: ventaId,
    monto,
    medio_pago: medioPago,
  });
  if (pagoError) throw pagoError;

  // Recalcular estado de pago con el total abonado.
  const [{ data: venta }, { data: pagos }] = await Promise.all([
    supabase.from("ventas").select("total").eq("id", ventaId).single(),
    supabase.from("pagos_abonos").select("monto").eq("venta_id", ventaId),
  ]);
  const abonado = (pagos ?? []).reduce((s, p) => s + p.monto, 0);
  const estado = venta && abonado >= venta.total ? "pagada" : "abono_parcial";
  await supabase.from("ventas").update({ estado_pago: estado }).eq("id", ventaId);

  revalidatePath("/ventas");
  revalidatePath("/");
}
