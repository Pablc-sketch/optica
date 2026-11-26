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
