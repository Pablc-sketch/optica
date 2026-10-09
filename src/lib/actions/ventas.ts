"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { diaEnChile, sumarDias } from "@/lib/fechas";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";
import { costoRealCristal, precioVentaCristal } from "@/lib/precio-venta";
import { rangoParaPosicion } from "@/lib/cristales";
import { normalizarVenta, ubicacionDeCupo, type ArmazonPedido, type CristalPedido, type ItemPedido } from "@/lib/venta-normalizar";

// Lo que manda el punto de venta, online u offline (es el mismo contrato:
// la cola offline guarda exactamente esto y lo vuelve a mandar al
// reconectar). El precio cobrado lo decide la vendedora —puede rebajarlo o
// regalar el lente—, pero costo, origen (stock/laboratorio) y diseño se
// recalculan acá, en el servidor, con el catálogo y la receta: el navegador
// ya no los puede imponer (A07/F09).
export type VentaInput = {
  // Clave de idempotencia: la genera el POS una vez por venta. El mismo id
  // dos veces (doble clic, reintento, sync offline) no crea dos ventas.
  ventaId: string;
  // Cuándo se hizo de verdad la venta (offline: antes de sincronizar).
  fecha?: string | null;
  pacienteId: string | null;
  operativoId?: string | null;
  recetaId?: string | null;
  sucursalId?: string | null;
  items: ItemPedido[];
  cristales: CristalPedido[];
  armazones: ArmazonPedido[];
  abonoInicial: number;
  medioPago: string;
  proveedorLabId?: string | null;
};

export type ResultadoVenta =
  | { ok: true; ventaId: string; otFolio: number | null; otFolios?: number[] }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEDIOS = ["efectivo", "debito", "credito", "transferencia"];

export async function registrarVenta(input: VentaInput): Promise<ResultadoVenta> {
  let ctx;
  try {
    ctx = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const { supabase, tenantId } = ctx;

  if (!UUID.test(input.ventaId ?? "")) return { ok: false, error: "Falta el identificador de la venta." };
  if (!MEDIOS.includes(input.medioPago)) return { ok: false, error: "Medio de pago inválido." };
  if (!Number.isInteger(input.abonoInicial) || input.abonoInicial < 0) {
    return { ok: false, error: "El abono tiene que ser un monto entero, sin negativos." };
  }
  const normal = normalizarVenta(input.cristales ?? [], input.armazones ?? [], input.items ?? []);
  if (!normal.ok) return normal;
  const { cristales, marcoDeCupo, items } = normal.venta;
  if (cristales.length > 0 && !input.pacienteId) {
    return { ok: false, error: "Para vender cristales hay que elegir al paciente (la orden de trabajo es suya)." };
  }

  const fechaVenta = input.fecha && !Number.isNaN(Date.parse(input.fecha)) ? input.fecha : new Date().toISOString();
  const diaVenta = diaEnChile(fechaVenta);

  // Receta: la que se usó en pantalla, siempre que sea de este paciente.
  let receta: Record<string, unknown> | null = null;
  if (input.pacienteId && cristales.length > 0) {
    const consulta = supabase
      .from("recetas")
      .select("id, od_esfera, od_cilindro, od_add, oi_esfera, oi_cilindro, oi_add")
      .eq("paciente_id", input.pacienteId);
    const { data } = input.recetaId
      ? await consulta.eq("id", input.recetaId).maybeSingle()
      : await consulta.order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (input.recetaId && !data) return { ok: false, error: "La receta elegida no es de este paciente." };
    receta = data;
  }
  const potencias = receta
    ? {
        od_esfera: receta.od_esfera as number | null,
        od_cilindro: receta.od_cilindro as number | null,
        od_add: receta.od_add as number | null,
        oi_esfera: receta.oi_esfera as number | null,
        oi_cilindro: receta.oi_cilindro as number | null,
        oi_add: receta.oi_add as number | null,
      }
    : null;

  // Costo y origen, recalculados acá. Si el catálogo no se puede leer o
  // falta la equivalencia, NO se inventa un costo: la venta se detiene con
  // un mensaje claro (F07).
  const ots: Record<string, unknown>[] = [];
  const preciosLista = new Map<number, number>();
  if (cristales.length > 0) {
    let cotizar;
    try {
      cotizar = await cargarCatalogoParaCotizar(supabase);
    } catch {
      return { ok: false, error: "No se pudo leer el catálogo de precios. Revisa la conexión e intenta de nuevo." };
    }
    const { data: tenant } = await supabase
      .from("tenants")
      .select("factor_venta_cristales, dias_entrega_default")
      .eq("id", tenantId)
      .single();

    const calculados: { c: (typeof cristales)[number]; costo: NonNullable<ReturnType<typeof costoRealCristal>> }[] = [];
    for (const c of cristales) {
      const fila = cotizar.filas.find(
        (f) => f.tipo_lente === c.tipoLente && f.tratamiento === c.tratamiento && f.rango_receta === c.rangoReceta
      );
      if (!fila) return { ok: false, error: `El cristal ${c.tipoLente} ${c.tratamiento} (${c.rangoReceta}) no está en el catálogo.` };
      const posicion = c.tipoLente === "Monofocal" ? (c.posicion ?? "lejos") : "lejos";
      if (potencias) {
        const rangoReal = rangoParaPosicion(
          [potencias.od_esfera, potencias.oi_esfera],
          [potencias.od_cilindro, potencias.oi_cilindro],
          [potencias.od_add, potencias.oi_add],
          posicion
        );
        if (rangoReal !== c.rangoReceta) {
          return { ok: false, error: "La receta cambió desde que se cotizó. Vuelve a elegir el cristal para recalcular el precio." };
        }
      }
      const costo = costoRealCristal(fila, potencias, posicion, cotizar.catalogo, diaVenta);
      if (!costo) {
        return { ok: false, error: `Falta la equivalencia con el laboratorio para ${c.tipoLente} ${c.tratamiento}. Revísala en Precios.` };
      }
      preciosLista.set(c.cupo, precioVentaCristal(fila, costo.origen, Number(tenant?.factor_venta_cristales ?? 0)));
      calculados.push({ c, costo });
    }

    const { data: operativo } = input.operativoId
      ? await supabase.from("operativos").select("fecha_entrega_estimada").eq("id", input.operativoId).maybeSingle()
      : { data: null };
    const entrega: string = operativo?.fecha_entrega_estimada ?? sumarDias(diaVenta, Number(tenant?.dias_entrega_default ?? 7));

    const necesitaLab = calculados.some((x) => x.costo.origen === "laboratorio");
    let proveedor = input.proveedorLabId ?? null;
    if (necesitaLab && !proveedor) {
      const { data } = await supabase.from("proveedores").select("id").eq("tipo", "laboratorio").order("nombre").limit(1).maybeSingle();
      proveedor = data?.id ?? null;
    }

    // Una orden por cada dos pares: 1 y 2 en la primera, 3 y 4 en la
    // segunda… Cada orden lleva el laboratorio solo si alguno de SUS
    // cristales hay que tallarlo.
    const lado = (x: (typeof calculados)[number], sufijo: "" | "_2") => {
      const marco = marcoDeCupo[x.c.cupo];
      return {
        [`armazon_producto_id${sufijo}`]: marco?.marcoPropio ? null : (marco?.productoId ?? null),
        [`marco_propio${sufijo}`]: marco?.marcoPropio ?? false,
        [`marco_descripcion${sufijo}`]:
          marco && !marco.marcoPropio && !marco.productoId ? (marco.descripcion ?? "").trim().slice(0, 120) || null : null,
        [`tipo_lente${sufijo}`]: x.c.tipoLente,
        [`rango_receta${sufijo}`]: x.c.rangoReceta,
        [`tratamiento${sufijo}`]: x.c.tratamiento,
        [`origen_cristal${sufijo}`]: x.costo.origen,
        [`diseno_laboratorio${sufijo}`]: x.costo.diseno,
        [`costo_laboratorio${sufijo}`]: x.costo.costo,
        [`posicion${sufijo}`]: x.c.tipoLente === "Monofocal" ? (x.c.posicion ?? "lejos") : null,
      };
    };
    for (let i = 0; i < calculados.length; i += 2) {
      const uno = calculados[i];
      const dos = calculados[i + 1];
      const tallaAlguno = uno.costo.origen === "laboratorio" || dos?.costo.origen === "laboratorio";
      ots.push({
        receta_id: (receta?.id as string | undefined) ?? null,
        fecha_entrega_estimada: entrega,
        proveedor_lab_id: tallaAlguno ? proveedor : null,
        ...lado(uno, ""),
        ...(dos ? lado(dos, "_2") : {}),
      });
    }
  }

  // Precio de lista de los productos (marcos, accesorios), para dejar a la
  // vista cuándo se vendieron con descuento o de regalo.
  const idsProductos = [...new Set(items.map((i) => i.productoId).filter((x): x is string => Boolean(x)))];
  const { data: productos } = idsProductos.length
    ? await supabase.from("productos").select("id, precio_venta").in("id", idsProductos)
    : { data: [] as { id: string; precio_venta: number }[] };
  if ((productos ?? []).length !== idsProductos.length) return { ok: false, error: "Un producto de la venta no existe." };

  const { data, error } = await supabase.rpc("registrar_venta", {
    p: {
      venta_id: input.ventaId,
      fecha: fechaVenta,
      paciente_id: input.pacienteId,
      sucursal_id: input.sucursalId ?? null,
      operativo_id: input.operativoId ?? null,
      abono: input.abonoInicial,
      medio_pago: input.medioPago,
      ots,
      items: items.map((i) => ({
        producto_id: i.productoId ?? null,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precio_unitario: i.precioUnitario,
        ot_index: i.cristalSlot ? ubicacionDeCupo(i.cristalSlot).orden : null,
        cristal_slot: i.cristalSlot ? ubicacionDeCupo(i.cristalSlot).slot : null,
        precio_lista: i.cristalSlot
          ? (preciosLista.get(i.cristalSlot) ?? null)
          : (productos ?? []).find((p) => p.id === i.productoId)?.precio_venta ?? null,
      })),
    },
  });
  if (error) return { ok: false, error: `No se pudo guardar la venta: ${error.message}` };

  revalidatePath("/ventas");
  revalidatePath("/ot");
  revalidatePath("/laboratorio");
  revalidatePath("/reportes");
  revalidatePath("/");
  const res = data as { ot_folio: number | null; ot_folios?: number[] | null };
  return { ok: true, ventaId: input.ventaId, otFolio: res.ot_folio ?? null, otFolios: res.ot_folios ?? [] };
}

// Abono con la venta bloqueada en la base: nunca más que el saldo, aunque
// lleguen dos al mismo tiempo, y el mismo formulario enviado dos veces
// (operacion_id) cobra una sola vez (A05).
export async function registrarAbono(formData: FormData) {
  const { supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });

  const ventaId = String(formData.get("venta_id") ?? "");
  const operacionId = String(formData.get("operacion_id") ?? "");
  const monto = Math.round(Number(String(formData.get("monto") ?? "").replace(/\./g, "")));
  const medioPago = String(formData.get("medio_pago") ?? "efectivo");
  if (!UUID.test(ventaId) || !UUID.test(operacionId) || !Number.isFinite(monto) || monto <= 0) return;
  if (!MEDIOS.includes(medioPago)) return;

  const { error } = await supabase.rpc("registrar_abono", {
    p_id: operacionId,
    p_venta_id: ventaId,
    p_monto: monto,
    p_medio_pago: medioPago,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/ventas");
  revalidatePath("/ot");
  revalidatePath("/reportes");
  revalidatePath("/");
}

// El número que imprime la máquina (Mercado Pago, etc.) al cobrar con
// tarjeta — se guarda después, cuando se arma la boleta detallada para un
// reembolso, no necesariamente en el momento del cobro.
export async function actualizarVoucherAbono(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const abonoId = String(formData.get("abono_id") ?? "");
  const numeroVoucher = String(formData.get("numero_voucher") ?? "").trim() || null;
  if (!abonoId) return;

  const { error } = await supabase.from("pagos_abonos").update({ numero_voucher: numeroVoucher }).eq("id", abonoId);
  if (error) throw error;

  revalidatePath("/boleta");
}

// A diferencia de eliminarOT (que exige que no haya pagos), anular sí se
// permite con pagos ya registrados: el caso real es "esta venta no debió
// existir" (prueba, cliente equivocado, monto mal cobrado), no "todavía no
// se cobró". No se borra — queda marcada "anulada" y sale de los reportes,
// pero el comprobante original sigue existiendo como registro de lo que
// pasó. Se revierte el stock que había salido y se cancela la OT ligada
// (si no se había entregado ya).
export async function anularVenta(formData: FormData) {
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message };
    throw e;
  }
  const ventaId = String(formData.get("venta_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;

  // Una sola transacción: devuelve el stock NETO (venta + ediciones) una
  // vez, cancela las OT y deja registro. Antes devolvía solo lo de la
  // venta original y, si se editó la cantidad, el stock quedaba mal (A06).
  const { error } = await supabase.rpc("anular_venta", { p_venta_id: ventaId, p_motivo: motivo });
  if (error) return { ok: false as const, error: error.message };

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
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false as const, error: e.message };
    throw e;
  }
  const ventaId = String(formData.get("venta_id") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim() || null;

  const { data: itemsActuales } = await supabase
    .from("venta_items")
    .select("id, cantidad, precio_unitario, descuento")
    .eq("venta_id", ventaId);
  if (!itemsActuales || itemsActuales.length === 0) {
    return { ok: false as const, error: "No se encontraron los ítems de la venta." };
  }

  // Lo que no se tocó en el formulario conserva su valor; lo escrito se
  // manda tal cual y la base lo valida (enteros, sin negativos, descuento
  // no mayor al ítem, total no bajo lo ya pagado).
  const leer = (v: FormDataEntryValue | null, actual: number) => {
    if (v === null || String(v).trim() === "") return actual;
    const n = Number(String(v).replace(/\./g, ""));
    return Number.isFinite(n) ? n : Number.NaN;
  };
  const cambios = itemsActuales.map((item) => ({
    id: item.id,
    cantidad: leer(formData.get(`cantidad_${item.id}`), item.cantidad),
    precio_unitario: leer(formData.get(`precio_${item.id}`), item.precio_unitario),
    descuento: leer(formData.get(`descuento_${item.id}`), item.descuento),
  }));
  if (cambios.some((c) => [c.cantidad, c.precio_unitario, c.descuento].some((n) => !Number.isInteger(n) || n < 0))) {
    return { ok: false as const, error: "Cantidades, precios y descuentos tienen que ser números enteros, sin negativos." };
  }

  const { error } = await supabase.rpc("actualizar_venta", {
    p_venta_id: ventaId,
    p_items: cambios.map((c) => ({ ...c, cantidad: String(c.cantidad), precio_unitario: String(c.precio_unitario), descuento: String(c.descuento) })),
    p_motivo: motivo,
  });
  if (error) return { ok: false as const, error: error.message };

  revalidatePath("/ventas");
  revalidatePath(`/ventas/${ventaId}`);
  revalidatePath("/reportes");
  revalidatePath("/");
  return { ok: true as const };
}

// Entregar los lentes de una venta: pasa a "entregado" las órdenes que
// estaban LISTAS. No registra ningún pago: cobrar y entregar son dos
// acciones distintas (una entrega no prueba un pago).
export async function entregarVenta(ventaId: string): Promise<{ ok: boolean; entregadas?: number; error?: string }> {
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "ventas", "bodega"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  const { data: items, error: errItems } = await supabase.from("venta_items").select("ot_id").eq("venta_id", ventaId);
  if (errItems) return { ok: false, error: errItems.message };
  const ots = [...new Set((items ?? []).map((i) => i.ot_id).filter((x): x is string => Boolean(x)))];
  if (ots.length === 0) return { ok: false, error: "Esta venta no tiene órdenes de trabajo." };
  const { data, error } = await supabase
    .from("ordenes_trabajo")
    .update({ estado: "entregado", fecha_entrega_real: new Date().toISOString() })
    .in("id", ots)
    .eq("estado", "listo")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "No había lentes listos para entregar en esta venta." };
  revalidatePath("/cobros");
  revalidatePath("/ot");
  revalidatePath("/avisos");
  revalidatePath("/");
  return { ok: true, entregadas: data.length };
}

// Cobro desde la pantalla de Cobros, con respuesta clara (registrarAbono
// es para formularios y no devuelve nada).
export async function cobrarSaldo(input: {
  ventaId: string;
  operacionId: string;
  monto: number;
  medioPago: string;
}): Promise<{ ok: boolean; aplicado?: number; error?: string }> {
  let supabase;
  try {
    ({ supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { ok: false, error: e.message };
    throw e;
  }
  if (!UUID.test(input.ventaId) || !UUID.test(input.operacionId)) return { ok: false, error: "Datos inválidos." };
  if (!Number.isInteger(input.monto) || input.monto <= 0) return { ok: false, error: "El monto tiene que ser mayor a cero." };
  if (!MEDIOS.includes(input.medioPago)) return { ok: false, error: "Medio de pago inválido." };
  const { data, error } = await supabase.rpc("registrar_abono", {
    p_id: input.operacionId,
    p_venta_id: input.ventaId,
    p_monto: input.monto,
    p_medio_pago: input.medioPago,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cobros");
  revalidatePath("/ventas");
  revalidatePath("/reportes");
  revalidatePath("/");
  return { ok: true, aplicado: (data as { aplicado: number } | null)?.aplicado ?? input.monto };
}
