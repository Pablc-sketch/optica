"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { montoANumero } from "@/lib/formato";

// El stock nunca se escribe a mano: se registra un movimiento y el trigger
// trg_movimiento_stock lo aplica. Así queda historial de por qué cambió.
export async function registrarMovimiento(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");

  const productoId = String(formData.get("producto_id"));
  const sucursalId = String(formData.get("sucursal_id"));
  const tipo = String(formData.get("tipo"));
  const cantidad = Math.round(Number(formData.get("cantidad")));
  const referencia = String(formData.get("referencia") ?? "").trim() || null;

  if (!["entrada", "salida", "ajuste"].includes(tipo)) return;
  if (!Number.isFinite(cantidad) || cantidad === 0) return;
  // Entrada y salida se registran en positivo; el ajuste admite negativo
  // para corregir un conteo hacia abajo.
  if (tipo !== "ajuste" && cantidad < 0) return;

  const { error } = await supabase.from("movimientos_inventario").insert({
    tenant_id: perfil.tenant_id,
    producto_id: productoId,
    sucursal_id: sucursalId,
    tipo,
    cantidad,
    referencia,
  });
  if (error) throw error;

  revalidatePath("/inventario");
  revalidatePath("/");
}

const CATEGORIAS = ["armazon", "cristal", "lente_contacto", "otro"] as const;

// Alta de un producto nuevo (armazón, lente de contacto, etc.). Crea también
// su fila de inventario en cada sucursal (en 0) para que después los
// movimientos de stock tengan sobre qué aplicarse: sin esa fila, un
// "entrada" no tiene qué actualizar. El stock inicial no se escribe a mano
// en `inventario`, se registra como el primer movimiento (mismo camino que
// cualquier otro ajuste de stock, con su historial).
export async function crearProducto(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");

  const categoria = String(formData.get("categoria") ?? "armazon");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const marca = String(formData.get("marca") ?? "").trim() || null;
  const modelo = String(formData.get("modelo") ?? "").trim() || null;
  const color = String(formData.get("color") ?? "").trim() || null;
  // Código corto del proveedor (ej. "C1"), distinto del nombre descriptivo
  // en 'color' (ej. "Negro brillante"): sirve para pedir/identificar la
  // variante exacta ante el proveedor.
  const codigoColor = String(formData.get("codigo_color") ?? "").trim() || null;
  const sku = String(formData.get("sku") ?? "").trim() || null;
  // Los montos llegan con separador de miles ("45.000"): Number() los
  // leería como NaN y el producto quedaría con costo 0.
  const costo = montoANumero(formData.get("costo"));
  const precioVenta = montoANumero(formData.get("precio_venta"));
  const stockInicial = Math.max(0, Math.round(Number(formData.get("stock_inicial")) || 0));
  const sucursalId = String(formData.get("sucursal_id") ?? "");
  const proveedorId = String(formData.get("proveedor_id") ?? "").trim() || null;

  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!(CATEGORIAS as readonly string[]).includes(categoria)) return { ok: false, error: "Categoría inválida." };

  const { data: producto, error } = await supabase
    .from("productos")
    .insert({
      tenant_id: perfil.tenant_id,
      categoria,
      nombre,
      marca,
      modelo,
      color,
      codigo_color: codigoColor,
      sku,
      costo,
      precio_venta: precioVenta,
      proveedor_id: proveedorId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "No se pudo crear el producto." };

  const { data: sucursales } = await supabase.from("sucursales").select("id").eq("tenant_id", perfil.tenant_id);
  const filasInventario = (sucursales ?? []).map((s) => ({
    tenant_id: perfil.tenant_id,
    sucursal_id: s.id,
    producto_id: producto.id,
    stock_actual: 0,
    stock_minimo: 0,
  }));
  if (filasInventario.length > 0) {
    const { error: invError } = await supabase.from("inventario").insert(filasInventario);
    if (invError) return { ok: false, error: "El producto se creó, pero no se pudo preparar el inventario." };
  }

  if (stockInicial > 0 && sucursalId) {
    await supabase.from("movimientos_inventario").insert({
      tenant_id: perfil.tenant_id,
      producto_id: producto.id,
      sucursal_id: sucursalId,
      tipo: "entrada",
      cantidad: stockInicial,
      referencia: "Carga inicial",
    });
  }

  revalidatePath("/inventario");
  revalidatePath("/precios");
  return { ok: true, id: producto.id as string };
}

// La foto se sube desde el navegador (subir-foto-marco.tsx, mismo patrón
// que subir-logo.tsx); acá solo se guarda la URL pública ya subida.
export async function guardarFotoProducto(productoId: string, url: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("productos").update({ imagen_url: url }).eq("id", productoId);
  if (error) return { ok: false as const, error: "No se pudo guardar la foto." };

  revalidatePath("/inventario");
  return { ok: true as const };
}

const TIPOS_PROVEEDOR = ["laboratorio", "armazones", "otro"] as const;

export async function crearProveedor(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id").eq("id", user.id).single();
  if (!perfil) throw new Error("Perfil no encontrado");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const tipo = String(formData.get("tipo") ?? "otro");

  if (!nombre) return { ok: false, error: "El nombre es obligatorio." };
  if (!(TIPOS_PROVEEDOR as readonly string[]).includes(tipo)) return { ok: false, error: "Tipo inválido." };

  const { error } = await supabase.from("proveedores").insert({ tenant_id: perfil.tenant_id, nombre, tipo });
  if (error) return { ok: false, error: "No se pudo crear el proveedor." };

  revalidatePath("/inventario");
  return { ok: true };
}

export async function actualizarStockMinimo(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("inventario_id"));
  const minimo = Math.round(Number(formData.get("stock_minimo")));
  if (!Number.isFinite(minimo) || minimo < 0) return;

  const { error } = await supabase.from("inventario").update({ stock_minimo: minimo }).eq("id", id);
  if (error) throw error;
  revalidatePath("/inventario");
}
