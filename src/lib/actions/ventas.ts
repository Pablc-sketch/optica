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
  // A cuál de los dos cupos de cristal de la OT corresponde este ítem (1 o
  // 2) — lejos y cerca por separado comparten la misma OT, no una cada uno.
  cristalSlot?: 1 | 2;
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
  cristales?: DatosCristal[];
  // Un armazón por cristal, en el mismo orden: dos pares separados (lejos y
  // cerca) llevan cada uno su propio marco.
  armazonProductoIds?: (string | null)[];
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
  // cargar dos veces los mismos datos. Lejos y cerca por separado comparten
  // UNA sola OT (un folio, un cupo cada uno) — así cuando vuelve del
  // laboratorio es un solo paquete por paciente, no dos que emparejar por
  // nombre y RUT.
  const cristales = input.cristales ?? [];
  let otId: string | null = null;
  let otFolio: number | null = null;
  if (input.pacienteId && cristales.length > 0) {
    const necesitaLab = cristales.some((c) => c.origen === "laboratorio");
    const [recetaRes, sucursalRes, proveedorRes, config] = await Promise.all([
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
      necesitaLab && !input.proveedorLabId
        ? supabase.from("proveedores").select("id").eq("tipo", "laboratorio").limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      // El plazo lo define cada óptica en Configuración según lo que demore
      // su laboratorio; 7 días es solo el respaldo si aún no lo ajustó.
      supabase.from("tenants").select("dias_entrega_default").eq("id", tenantId).single(),
    ]);

    // "Hoy" tiene que ser el de Chile: entrada en el servidor (UTC) usaba
    // getDate()/setDate() con el reloj del servidor, así que una venta de
    // noche en Chile (ya "mañana" en UTC) calculaba la entrega un día de
    // más.
    const entregaISO = sumarDias(
      hoyEnChile(),
      input.diasEntrega ?? config.data?.dias_entrega_default ?? 7
    );

    const [primero, segundo] = cristales;
    const { data: ot, error: otError } = await supabase
      .from("ordenes_trabajo")
      .insert({
        tenant_id: tenantId,
        paciente_id: input.pacienteId,
        receta_id: recetaRes.data?.id ?? null,
        sucursal_id: sucursalRes.data?.id ?? null,
        operativo_id: input.operativoId ?? null,
        armazon_producto_id: input.armazonProductoIds?.[0] ?? null,
        tipo_lente: primero.tipoLente,
        rango_receta: primero.rangoReceta,
        tratamiento: primero.tratamiento,
        origen_cristal: primero.origen,
        proveedor_lab_id: input.proveedorLabId ?? proveedorRes.data?.id ?? null,
        costo_laboratorio: primero.costoLaboratorio,
        fecha_entrega_estimada: entregaISO,
        armazon_producto_id_2: segundo ? (input.armazonProductoIds?.[1] ?? null) : null,
        tipo_lente_2: segundo?.tipoLente ?? null,
        rango_receta_2: segundo?.rangoReceta ?? null,
        tratamiento_2: segundo?.tratamiento ?? null,
        costo_laboratorio_2: segundo?.costoLaboratorio ?? null,
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
      ot_id: i.cristalSlot !== undefined ? otId : null,
      cristal_slot: i.cristalSlot ?? null,
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

// Corregir un error sin tener que anular y rehacer la venta entera:
// cantidad, precio y descuento de cada ítem se pueden ajustar acá. No se
// cambia qué producto/OT lleva cada ítem (eso sí implica anular y rehacer),
// solo los números. El total de la venta se recalcula solo, y el stock del
// marco se ajusta por la diferencia si la cantidad cambió.
export async function actualizarVenta(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");
  const tenantId = perfil.tenant_id as string;

  const ventaId = String(formData.get("venta_id"));
  const { data: venta } = await supabase.from("ventas").select("id, anulada").eq("id", ventaId).single();
  if (!venta) return { ok: false as const, error: "Venta no encontrada." };
  if (venta.anulada) return { ok: false as const, error: "Esta venta está anulada, no se puede editar." };

  const { data: itemsActuales } = await supabase
    .from("venta_items")
    .select("id, producto_id, cantidad, precio_unitario, descuento")
    .eq("venta_id", ventaId);
  if (!itemsActuales || itemsActuales.length === 0) {
    return { ok: false as const, error: "No se encontraron los ítems de la venta." };
  }

  const numero = (v: FormDataEntryValue | null, actual: number) => {
    if (v === null) return actual;
    const n = Math.round(Number(String(v).replace(/\./g, "")));
    return Number.isFinite(n) && n >= 0 ? n : actual;
  };

  let nuevoTotal = 0;
  for (const item of itemsActuales) {
    const cantidad = Math.max(1, numero(formData.get(`cantidad_${item.id}`), item.cantidad));
    const precio = numero(formData.get(`precio_${item.id}`), item.precio_unitario);
    const descuento = numero(formData.get(`descuento_${item.id}`), item.descuento);

    if (cantidad !== item.cantidad || precio !== item.precio_unitario || descuento !== item.descuento) {
      const { error } = await supabase
        .from("venta_items")
        .update({ cantidad, precio_unitario: precio, descuento })
        .eq("id", item.id);
      if (error) throw error;
    }

    if (item.producto_id && cantidad !== item.cantidad) {
      const delta = cantidad - item.cantidad;
      const { data: mov } = await supabase
        .from("movimientos_inventario")
        .select("sucursal_id")
        .eq("referencia", `venta:${ventaId}`)
        .eq("producto_id", item.producto_id)
        .limit(1)
        .maybeSingle();
      if (mov?.sucursal_id) {
        const { error: movError } = await supabase.from("movimientos_inventario").insert({
          tenant_id: tenantId,
          producto_id: item.producto_id,
          sucursal_id: mov.sucursal_id,
          tipo: delta > 0 ? "salida" : "entrada",
          cantidad: Math.abs(delta),
          referencia: `edicion_venta:${ventaId}`,
        });
        if (movError) throw movError;
      }
    }

    nuevoTotal += cantidad * precio - descuento;
  }

  const { data: pagos } = await supabase.from("pagos_abonos").select("monto").eq("venta_id", ventaId);
  const abonado = (pagos ?? []).reduce((s, p) => s + p.monto, 0);
  const estado = abonado >= nuevoTotal ? "pagada" : abonado > 0 ? "abono_parcial" : "pendiente";

  const { error: totalError } = await supabase
    .from("ventas")
    .update({ total: Math.max(0, nuevoTotal), estado_pago: estado })
    .eq("id", ventaId);
  if (totalError) throw totalError;

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${ventaId}`);
  revalidatePath("/reportes");
  revalidatePath("/");
  return { ok: true as const };
}
