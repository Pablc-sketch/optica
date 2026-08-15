"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ItemVenta = {
  productoId?: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  esCristal?: boolean;
};

export type DatosCristal = {
  tipoLente: string;
  rangoReceta: string;
  tratamiento: string;
  costoLaboratorio: number;
  origen: "stock" | "laboratorio";
};

export async function registrarVenta(input: {
  pacienteId: string | null;
  items: ItemVenta[];
  abonoInicial: number;
  medioPago: string;
  cristal?: DatosCristal | null;
  armazonProductoId?: string | null;
  diasEntrega?: number;
  proveedorLabId?: string | null;
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

  // Si la venta lleva cristales y hay paciente, la orden de trabajo se crea
  // sola: en el mesón (y sobre todo en un operativo) no hay tiempo para
  // cargar dos veces los mismos datos.
  let otId: string | null = null;
  let otFolio: number | null = null;
  if (input.pacienteId && input.cristal) {
    const [recetaRes, sucursalRes, proveedorRes] = await Promise.all([
      supabase
        .from("recetas")
        .select("id")
        .eq("paciente_id", input.pacienteId)
        .order("fecha", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("sucursales").select("id").order("created_at").limit(1).maybeSingle(),
      // El vendedor elige el laboratorio en el POS; si no llegó ninguno (venta
      // vieja o sincronizada desde offline sin ese dato) se cae al primero
      // que haya registrado la óptica, para no dejar la OT sin laboratorio.
      input.cristal.origen === "laboratorio" && !input.proveedorLabId
        ? supabase.from("proveedores").select("id").eq("tipo", "laboratorio").limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // El plazo lo define cada óptica en Configuración según lo que demore
    // su laboratorio; 7 días es solo el respaldo si aún no lo ajustó.
    const { data: config } = await supabase
      .from("tenants")
      .select("dias_entrega_default")
      .eq("id", tenantId)
      .single();

    const entrega = new Date();
    entrega.setDate(entrega.getDate() + (input.diasEntrega ?? config?.dias_entrega_default ?? 7));

    const { data: ot, error: otError } = await supabase
      .from("ordenes_trabajo")
      .insert({
        tenant_id: tenantId,
        paciente_id: input.pacienteId,
        receta_id: recetaRes.data?.id ?? null,
        sucursal_id: sucursalRes.data?.id ?? null,
        armazon_producto_id: input.armazonProductoId ?? null,
        tipo_lente: input.cristal.tipoLente,
        rango_receta: input.cristal.rangoReceta,
        tratamiento: input.cristal.tratamiento,
        origen_cristal: input.cristal.origen,
        proveedor_lab_id: input.proveedorLabId ?? proveedorRes.data?.id ?? null,
        costo_laboratorio: input.cristal.costoLaboratorio,
        fecha_entrega_estimada: entrega.toISOString().slice(0, 10),
      })
      .select("id, folio")
      .single();
    if (otError) throw otError;
    otId = ot.id;
    otFolio = ot.folio;
  }

  const { error: itemsError } = await supabase.from("venta_items").insert(
    items.map((i) => ({
      tenant_id: tenantId,
      venta_id: venta.id,
      producto_id: i.productoId ?? null,
      ot_id: i.esCristal ? otId : null,
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
  revalidatePath("/ot");
  revalidatePath("/laboratorio");
  revalidatePath("/");
  return { ok: true, ventaId: venta.id as string, otFolio };
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
