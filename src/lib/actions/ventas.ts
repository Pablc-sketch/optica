"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hoyEnChile, sumarDias } from "@/lib/fechas";

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
  operativoId?: string | null;
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
      operativo_id: input.operativoId ?? null,
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

    // "Hoy" tiene que ser el de Chile: entrada en el servidor (UTC) usaba
    // getDate()/setDate() con el reloj del servidor, así que una venta de
    // noche en Chile (ya "mañana" en UTC) calculaba la entrega un día de
    // más.
    const entregaISO = sumarDias(hoyEnChile(), input.diasEntrega ?? config?.dias_entrega_default ?? 7);

    const { data: ot, error: otError } = await supabase
      .from("ordenes_trabajo")
      .insert({
        tenant_id: tenantId,
        paciente_id: input.pacienteId,
        receta_id: recetaRes.data?.id ?? null,
        sucursal_id: sucursalRes.data?.id ?? null,
        operativo_id: input.operativoId ?? null,
        armazon_producto_id: input.armazonProductoId ?? null,
        tipo_lente: input.cristal.tipoLente,
        rango_receta: input.cristal.rangoReceta,
        tratamiento: input.cristal.tratamiento,
        origen_cristal: input.cristal.origen,
        proveedor_lab_id: input.proveedorLabId ?? proveedorRes.data?.id ?? null,
        costo_laboratorio: input.cristal.costoLaboratorio,
        fecha_entrega_estimada: entregaISO,
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
  revalidatePath("/reportes");
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
  const montoIngresado = Math.round(Number(String(formData.get("monto")).replace(/\./g, "")));
  const medioPago = String(formData.get("medio_pago") ?? "efectivo");
  if (!montoIngresado || montoIngresado <= 0) return;

  // El saldo real manda: sin este tope, un typo (de más ceros de la
  // cuenta) queda guardado tal cual y nunca más se puede corregir desde la
  // interfaz — inflando "cobrado" en los reportes con plata que nunca
  // entró. Nunca se registra más de lo que efectivamente se debe.
  const [{ data: venta }, { data: pagosPrevios }] = await Promise.all([
    supabase.from("ventas").select("total").eq("id", ventaId).single(),
    supabase.from("pagos_abonos").select("monto").eq("venta_id", ventaId),
  ]);
  if (!venta) return;
  const abonadoPrevio = (pagosPrevios ?? []).reduce((s, p) => s + p.monto, 0);
  const saldo = venta.total - abonadoPrevio;
  const monto = Math.min(montoIngresado, Math.max(0, saldo));
  if (monto <= 0) return;

  const { error: pagoError } = await supabase.from("pagos_abonos").insert({
    tenant_id: perfil.tenant_id,
    venta_id: ventaId,
    monto,
    medio_pago: medioPago,
  });
  if (pagoError) throw pagoError;

  const estado = abonadoPrevio + monto >= venta.total ? "pagada" : "abono_parcial";
  await supabase.from("ventas").update({ estado_pago: estado }).eq("id", ventaId);

  revalidatePath("/ventas");
  revalidatePath("/ot");
  revalidatePath("/reportes");
  revalidatePath("/");
}

// A diferencia de eliminarOT (que exige que no haya pagos), anular sí se
// permite con pagos ya registrados: el caso real es "esta venta no debió
// existir" (prueba, cliente equivocado, monto mal cobrado), no "todavía no
// se cobró". No se borra — queda marcada "anulada" y sale de los reportes,
// pero el comprobante original sigue existiendo como registro de lo que
// pasó. Se revierte el stock que había salido y se cancela la OT ligada
// (si no se había entregado ya).
export async function anularVenta(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  const tenantId = perfil.tenant_id as string;

  const ventaId = String(formData.get("venta_id"));
  const motivo = String(formData.get("motivo") ?? "").trim() || null;

  const { data: venta } = await supabase.from("ventas").select("id, anulada").eq("id", ventaId).single();
  if (!venta) return { ok: false as const, error: "Venta no encontrada." };
  if (venta.anulada) return { ok: true as const };

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
      referencia: `anulacion_venta:${ventaId}`,
    });
    if (devError) throw devError;
  }

  const { data: items } = await supabase.from("venta_items").select("ot_id").eq("venta_id", ventaId);
  const otIds = [...new Set((items ?? []).map((i) => i.ot_id).filter((id): id is string => Boolean(id)))];
  if (otIds.length > 0) {
    const { error: otError } = await supabase
      .from("ordenes_trabajo")
      .update({ estado: "cancelado" })
      .in("id", otIds)
      .neq("estado", "entregado");
    if (otError) throw otError;
  }

  const { error: ventaError } = await supabase
    .from("ventas")
    .update({ anulada: true, anulada_motivo: motivo })
    .eq("id", ventaId);
  if (ventaError) throw ventaError;

  revalidatePath("/ventas");
  revalidatePath("/ot");
  revalidatePath("/reportes");
  revalidatePath("/laboratorio");
  revalidatePath("/operativos");
  revalidatePath("/");
  return { ok: true as const };
}
