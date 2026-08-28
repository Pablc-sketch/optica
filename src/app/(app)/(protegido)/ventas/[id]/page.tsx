import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { fechaLegible, diaEnChile } from "@/lib/fechas";
import AnularVenta from "../anular-venta";
import EditarItemsVenta from "../editar-items-venta";

// Corregir un error en una venta ya hecha (precio, cantidad o descuento mal
// cargado) sin tener que anularla y rehacerla — para eso ya está "Anular
// venta". Acá no se cambia QUÉ se vendió (el producto o el cristal de cada
// ítem), solo los números.

export default async function EditarVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase
    .from("ventas")
    .select(
      `id, fecha, total, estado_pago, anulada, anulada_motivo,
       pacientes:paciente_id (nombre, rut),
       venta_items (id, descripcion, cantidad, precio_unitario, descuento, producto_id, ot_id)`
    )
    .eq("id", id)
    .single();
  if (!venta) notFound();

  const paciente = venta.pacientes as unknown as { nombre: string; rut: string | null } | null;
  const items = venta.venta_items ?? [];

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
        <div className="flex items-center gap-2">
          <Link
            href={`/ventas/${venta.id}/comprobante`}
            className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema"
          >
            🖨 Comprobante
          </Link>
          {!venta.anulada && <AnularVenta ventaId={venta.id} />}
        </div>
      </div>

      {venta.anulada ? (
        <p className="rounded-2xl bg-neutral-200 p-4 text-sm font-semibold text-neutral-700">
          Esta venta está anulada{venta.anulada_motivo ? ` — ${venta.anulada_motivo}` : ""}. No se puede editar.
        </p>
      ) : (
        <EditarItemsVenta ventaId={venta.id} items={items} total={venta.total} />
      )}
    </div>
  );
}
