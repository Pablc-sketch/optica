"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { cargarCompraMarcos } from "@/lib/cargar-compra-marcos";

export type EstadoCompraMarcos = { ok: boolean; mensaje: string };

export async function guardarCompraMarcos(_previo: EstadoCompraMarcos, form: FormData): Promise<EstadoCompraMarcos> {
  const clave = String(form.get("clave") ?? "");
  const revision = String(form.get("revision") ?? "");
  const valor = String(form.get("en_mano") ?? "");
  const enMano = valor === "" ? null : Number(valor);
  if (!/^[0-9a-f]{64}$/.test(clave) || !/^[0-9a-f]{64}$/.test(revision)
      || (enMano !== null && (!/^\d+$/.test(valor) || !Number.isSafeInteger(enMano) || enMano > 2147483647))) {
    return { ok: false, mensaje: "Ingresa un conteo válido de marcos." };
  }
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
    const { filas } = await cargarCompraMarcos(supabase, tenantId);
    const fila = filas.find(item => item.clave === clave && item.revision === revision);
    if (!fila || (fila.stock !== null && String(fila.porComprar) !== form.get("por_comprar"))) {
      return { ok: false, mensaje: "La lista cambió. Recarga para ver el pedido actualizado." };
    }
    const compra = fila.stock === null ? (enMano === null ? null : Math.max(0, fila.pedidos - enMano)) : fila.porComprar;
    const comprado = form.get("comprado") === "on";
    if (comprado && (compra === null || compra === 0)) {
      return { ok: false, mensaje: "Anota cuántos tienes en mano para confirmar una compra pendiente." };
    }
    const { error } = await supabase.from("lista_compra_marcos").upsert({
      tenant_id: tenantId, clave, revision, en_mano: fila.stock === null ? enMano : null,
      comprados: comprado ? (compra ?? 0) : 0,
    }, { onConflict: "tenant_id,clave" });
    if (error) return { ok: false, mensaje: "No se pudo guardar. Intenta de nuevo." };
    revalidatePath("/inventario/compras");
    return { ok: true, mensaje: "Guardado" };
  } catch (error) {
    if (error instanceof SinPermiso) return { ok: false, mensaje: error.message };
    if (error instanceof Error && /^(No se pudo|No se pudieron)/.test(error.message)) return { ok: false, mensaje: error.message };
    throw error;
  }
}

export async function guardarMarcoManual(_previo: EstadoCompraMarcos, form: FormData): Promise<EstadoCompraMarcos> {
  const id = String(form.get("id") ?? "");
  const quitar = form.get("accion") === "quitar";
  const cantidadAnterior = Number(form.get("cantidad_anterior"));
  const compradoAnterior = form.get("comprado_anterior") === "true";
  const cantidadTexto = String(form.get("cantidad") ?? "");
  const cantidad = Number(cantidadTexto);
  const codigo = String(form.get("codigo") ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const proveedor = String(form.get("proveedor") ?? "").trim().replace(/\s+/g, " ");
  if ((id || quitar) && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    return { ok: false, mensaje: "El marco no está disponible. Recarga la lista." };
  }
  if (id && (!Number.isInteger(cantidadAnterior) || cantidadAnterior < 1 || cantidadAnterior > 2147483647)) {
    return { ok: false, mensaje: "Recarga la lista para editar este marco." };
  }
  if (!quitar && (!/^\d+$/.test(cantidadTexto) || cantidad < 1 || cantidad > 2147483647)) {
    return { ok: false, mensaje: "Ingresa una cantidad mayor que cero." };
  }
  if (!id && (!/[\p{L}\p{N}]/u.test(codigo) || codigo.length > 80 || !proveedor || proveedor.length > 80)) {
    return { ok: false, mensaje: "Ingresa un código y un proveedor válidos." };
  }

  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
    const tabla = supabase.from("lista_compra_marcos_manuales");
    if (!id) {
      const { error } = await tabla.insert({ tenant_id: tenantId, codigo, proveedor, cantidad });
      if (error?.code === "23505") return { ok: false, mensaje: "Este código ya está agregado con ese proveedor. Ajusta la cantidad en su fila." };
      if (error) return { ok: false, mensaje: "No se pudo agregar el marco. Intenta de nuevo." };
    } else {
      const cambio = quitar ? tabla.delete() : tabla.update({ cantidad, comprado: form.get("comprado") === "on" });
      const { data, error } = await cambio.eq("id", id).eq("tenant_id", tenantId)
        .eq("cantidad", cantidadAnterior).eq("comprado", compradoAnterior).select("id").maybeSingle();
      if (error) return { ok: false, mensaje: "No se pudo guardar el cambio. Intenta de nuevo." };
      if (!data) return { ok: false, mensaje: "El marco cambió. Recarga la lista para ver su estado." };
    }
    revalidatePath("/inventario/compras");
    return { ok: true, mensaje: quitar ? "Marco quitado" : id ? "Guardado" : "Marco agregado" };
  } catch (error) {
    if (error instanceof SinPermiso) return { ok: false, mensaje: error.message };
    throw error;
  }
}
