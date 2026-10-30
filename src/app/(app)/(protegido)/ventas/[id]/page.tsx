import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { fechaLegible, diaEnChile } from "@/lib/fechas";
import EditarDocumentosVenta from "@/components/editar-documentos-venta";
import AnularVenta from "../anular-venta";
import EditarItemsVenta from "../editar-items-venta";

// Corregir un error en una venta ya hecha (precio, cantidad o descuento mal
// cargado) sin tener que anularla y rehacerla — para eso ya está "Anular
// venta". Acá no se cambia QUÉ se vendió (el producto o el cristal de cada
// ítem), solo los números.

export default async function EditarVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user?.id ?? "").maybeSingle();
  const admin = perfil?.rol === "admin";

  const { data: venta } = await supabase
    .from("ventas")
    .select(
      `id, fecha, total, estado_pago, anulada, anulada_motivo, boleta_folio, boleta_fecha, ocultar_voucher, pagos_abonos (id, fecha, monto, medio_pago, numero_voucher),
       pacientes:paciente_id (nombre, rut),
       venta_items (id, descripcion, cantidad, precio_unitario, descuento, producto_id, ot_id, cristal_slot, ordenes_trabajo:ot_id (folio))`
    )
    .eq("id", id)
    .single();
  if (!venta) notFound();

  const paciente = venta.pacientes as unknown as { nombre: string; rut: string | null } | null;
  // Dos cristales de la misma venta comparten la misma OT y pueden tener
  // exactamente la misma descripción (ej. dos Monofocal Orgánico
  // Antirreflejo, uno lejos y uno cerca) — el cupo (1 o 2) es lo único que
  // los distingue al editar.
  const items = (venta.venta_items ?? []).map((item) => {
    const ot = item.ordenes_trabajo as unknown as { folio: number } | { folio: number }[] | null;
    const otUno = Array.isArray(ot) ? (ot[0] ?? null) : ot;
    return { ...item, otFolio: otUno?.folio ?? null };
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/ventas" className="text-xs font-medium text-brand-dark hover:underline">
            ← Ventas
          </Link>
          <h1 className="mt-1 text-xl font-bold">
            Venta del {fechaLegible(diaEnChile(venta.fecha))}
          </h1>
          <p className="text-sm text-tinta-suave">
            {paciente ? `${paciente.nombre}${paciente.rut ? ` · ${formatearRut(paciente.rut)}` : ""}` : "Sin paciente"}
          </p>
        </div>
      </div>

      {!venta.anulada && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link href={`/ventas/${venta.id}/reembolso`} className="rounded-xl bg-brand px-3 py-3 text-center font-semibold text-white">
            Reembolso
          </Link>
          <Link href={`/ventas/${venta.id}/comprobante`} className="rounded-xl bg-white px-3 py-3 text-center font-semibold shadow-sm">
            Comprobante
          </Link>
          <Link href={`/ventas/${venta.id}/certificado-fonasa`} className="rounded-xl bg-white px-3 py-3 text-center font-semibold shadow-sm">
            Certificado Fonasa
          </Link>
          <Link href={`/ventas/${venta.id}/expediente`} className="rounded-xl bg-white px-3 py-3 text-center font-semibold shadow-sm">
            PDF + boleta
          </Link>
        </div>
      )}

      {venta.anulada ? (
        <p className="rounded-2xl bg-neutral-200 p-4 text-sm font-semibold text-neutral-700">
          Esta venta está anulada{venta.anulada_motivo ? ` — ${venta.anulada_motivo}` : ""}. No se puede editar.
        </p>
      ) : (
        <>
          <EditarDocumentosVenta venta={venta} admin={admin} />
          <EditarItemsVenta ventaId={venta.id} items={items} total={venta.total} />
          <div className="flex justify-end"><AnularVenta ventaId={venta.id} /></div>
        </>
      )}
    </div>
  );
}
