"use server";
import { requerirPerfil } from "@/lib/autorizacion";
import { revalidatePath } from "next/cache";
import { instanteChile } from "@/lib/fecha-hora-chile";
import { validarVoucher } from "@/lib/voucher";
import { estadoPago, validarCambioAbono } from "@/lib/cambio-abono";
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function corregirDocumento(form: FormData) {
 try {
  const { supabase, tenantId, user, rol } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  const id = String(form.get("venta_id") || "");
  if (!UUID.test(id)) throw new Error("Venta inválida.");
  const { data: venta } = await supabase.from("ventas").select("id, anulada, total").eq("id", id).eq("tenant_id", tenantId).single();
  if (!venta || venta.anulada) throw new Error("Venta no disponible para editar.");
  const abono = String(form.get("abono_id") || "");
  if (abono) {
   if (!UUID.test(abono)) throw new Error("Abono inválido.");
   const { data: pagos } = await supabase.from("pagos_abonos").select("id, medio_pago, monto").eq("venta_id", id).eq("tenant_id", tenantId);
   const pago = (pagos ?? []).find((p) => p.id === abono);
   if (!pago) throw new Error("Abono no encontrado.");
   // Monto y medio: solo el administrador, y queda registro del cambio.
   const cambiaPlata = form.has("monto") && rol === "admin";
   let monto = pago.monto;
   let medio = pago.medio_pago;
   if (cambiaPlata) {
    const otros = (pagos ?? []).filter((p) => p.id !== abono).reduce((s, p) => s + p.monto, 0);
    const v = validarCambioAbono({ monto: Number(String(form.get("monto")).replace(/[^\d]/g, "")), medio: String(form.get("medio_pago") || ""), totalVenta: venta.total, otrosAbonos: otros });
    if (!v.ok) throw new Error(v.error);
    monto = v.monto;
    medio = v.medio;
   }
   const voucher = validarVoucher(medio, monto, form.get("numero_voucher"));
   if (voucher.error) throw new Error(voucher.error);
   const { data, error } = await supabase.from("pagos_abonos").update({ fecha: instanteChile(String(form.get("fecha"))), numero_voucher: voucher.numero, monto, medio_pago: medio }).eq("id", abono).eq("venta_id", id).eq("tenant_id", tenantId).select("id").single();
   if (error || !data) throw new Error("No se pudo guardar el abono.");
   if (monto !== pago.monto || medio !== pago.medio_pago) {
    const pagado = (pagos ?? []).reduce((s, p) => s + (p.id === abono ? monto : p.monto), 0);
    await supabase.from("ventas").update({ estado_pago: estadoPago(venta.total, pagado) }).eq("id", id).eq("tenant_id", tenantId);
    await supabase.from("ventas_cambios").insert({
     tenant_id: tenantId, venta_id: id, usuario_id: user.id, accion: "edicion", motivo: "Cambio de abono",
     antes: { abono_id: abono, monto: pago.monto, medio_pago: pago.medio_pago },
     despues: { abono_id: abono, monto, medio_pago: medio },
    });
   }
  } else {
   const folio = String(form.get("boleta_folio") || "").trim();
   const fechaBoleta = String(form.get("boleta_fecha") || "");
   if (folio && !/^\d{1,20}$/.test(folio)) throw new Error("Copia el folio numérico de la boleta.");
   if (fechaBoleta && (!/^\d{4}-\d{2}-\d{2}$/.test(fechaBoleta) || new Date(fechaBoleta + "T12:00:00Z").toISOString().slice(0,10) !== fechaBoleta)) throw new Error("Fecha de boleta inválida.");
   const { data, error } = await supabase.from("ventas").update({ fecha: instanteChile(String(form.get("fecha"))), boleta_folio: folio || null, boleta_fecha: fechaBoleta || null, ocultar_voucher: form.get("ocultar_voucher") === "on" }).eq("id", id).eq("tenant_id", tenantId).eq("anulada", false).select("id").single();
   if (error || !data) throw new Error("No se pudo guardar la venta.");
  }
  revalidatePath(`/ventas/${id}`, "layout");
  for (const ruta of ["/boleta", "/reportes", "/cobros", "/ventas", "/"]) revalidatePath(ruta);
  return { ok: true };
 } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar." }; }
}
