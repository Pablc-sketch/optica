"use server";
import { requerirPerfil } from "@/lib/autorizacion";
import { revalidatePath } from "next/cache";
import { instanteChile } from "@/lib/fecha-hora-chile";
import { validarVoucher } from "@/lib/voucher";
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
export async function corregirDocumento(form: FormData) {
 try {
  const { supabase, tenantId } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  const id = String(form.get("venta_id") || "");
  if (!UUID.test(id)) throw new Error("Venta inválida.");
  const { data: venta } = await supabase.from("ventas").select("id, anulada").eq("id", id).eq("tenant_id", tenantId).single();
  if (!venta || venta.anulada) throw new Error("Venta no disponible para editar.");
  const abono = String(form.get("abono_id") || "");
  if (abono) {
   if (!UUID.test(abono)) throw new Error("Abono inválido.");
   const { data: pago } = await supabase.from("pagos_abonos").select("medio_pago, monto").eq("id", abono).eq("venta_id", id).eq("tenant_id", tenantId).single();
   if (!pago) throw new Error("Abono no encontrado.");
   const voucher = validarVoucher(pago.medio_pago, pago.monto, form.get("numero_voucher"));
   if (voucher.error) throw new Error(voucher.error);
   const { data, error } = await supabase.from("pagos_abonos").update({ fecha: instanteChile(String(form.get("fecha"))), numero_voucher: voucher.numero }).eq("id", abono).eq("venta_id", id).eq("tenant_id", tenantId).select("id").single();
   if (error || !data) throw new Error("No se pudo guardar el abono.");
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
