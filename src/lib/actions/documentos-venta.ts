"use server";

import { requerirPerfil } from "@/lib/autorizacion";
import { revalidatePath } from "next/cache";
import { instanteChile } from "@/lib/fecha-hora-chile";
import { fechaValidaDocumento } from "@/lib/fecha-documentos";
import { validarVoucher } from "@/lib/voucher";
import { validarCambioAbono } from "@/lib/cambio-abono";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function corregirDocumento(form: FormData) {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    const id = String(form.get("venta_id") || "");
    const abono = String(form.get("abono_id") || "");
    if (!UUID.test(id) || (abono && !UUID.test(abono))) throw new Error("Venta o abono inválido.");
    const { data: venta } = await supabase.from("ventas").select("id,anulada,total")
      .eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!venta || venta.anulada) throw new Error("Venta no disponible para editar.");

    const fecha = instanteChile(String(form.get("fecha")));
    const folio = String(form.get("boleta_folio") || "").trim();
    const fechaBoleta = String(form.get("boleta_fecha") || "");
    let monto: number | null = null;
    let medio: string | null = null;
    let numeroVoucher: string | null = null;
    if (abono) {
      const { data: pagos, error } = await supabase.from("pagos_abonos").select("id,medio_pago,monto")
        .eq("venta_id", id).eq("tenant_id", tenantId);
      const pago = pagos?.find(p => p.id === abono);
      if (error || !pago) throw new Error("Abono no encontrado.");
      if (form.has("monto")) {
        const otros = (pagos ?? []).filter(p => p.id !== abono).reduce((suma, p) => suma + p.monto, 0);
        const validado = validarCambioAbono({
          monto: Number(String(form.get("monto")).replaceAll(".", "")),
          medio: String(form.get("medio_pago") || ""), totalVenta: venta.total, otrosAbonos: otros,
        });
        if (!validado.ok) throw new Error(validado.error);
        monto = validado.monto;
        medio = validado.medio;
      }
      const voucher = validarVoucher(medio ?? pago.medio_pago, monto ?? pago.monto, form.get("numero_voucher"));
      if (voucher.error) throw new Error(voucher.error);
      numeroVoucher = voucher.numero;
    } else {
      if (folio && !/^\d{1,20}$/.test(folio)) throw new Error("Copia el folio numérico de la boleta.");
      if (fechaBoleta && !fechaValidaDocumento(fechaBoleta)) throw new Error("Fecha de boleta inválida.");
    }

    const { error } = await supabase.rpc("corregir_documento_venta", {
      p_venta: id, p_abono: abono || null, p_fecha: fecha, p_monto: monto, p_medio: medio,
      p_voucher: numeroVoucher, p_folio: folio || null, p_boleta: fechaBoleta || null,
      p_ocultar: form.get("ocultar_voucher") === "on",
    });
    if (error) throw new Error(error.message);
    revalidatePath(`/ventas/${id}`, "layout");
    for (const ruta of ["/boleta", "/reportes", "/cobros", "/ventas", "/caja", "/operativos", "/"]) revalidatePath(ruta);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar." };
  }
}

export async function confirmarDevolucionVenta(_estado: { error?: string }, form: FormData) {
  const { supabase } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const abono = String(form.get("abono") || "");
  const venta = String(form.get("venta") || "");
  const referencia = String(form.get("referencia") || "").trim();
  if (!UUID.test(abono) || !UUID.test(venta) || referencia.length < 3 || referencia.length > 250) {
    return { error: "Indica el comprobante de la devolución." };
  }
  const { error } = await supabase.rpc("confirmar_devolucion_venta", { p_abono: abono, p_referencia: referencia });
  if (error) return { error: error.message };
  for (const ruta of [`/ventas/${venta}`, "/ventas/historial", "/caja", "/reportes", "/"]) revalidatePath(ruta);
  return {};
}
