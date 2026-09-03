import { createClient } from "@/lib/supabase/server";
import BuscarOTCliente, { type OTConDatos } from "./buscar-ot-cliente";

// Historial completo de órdenes de trabajo (spec: garantía y refacción de
// cristales). El tablero de /ot solo muestra las que están en proceso; acá
// se busca cualquiera, incluidas las entregadas hace tiempo, por folio o
// por nombre/RUT del paciente — la OT nunca se borra, solo se saca de la
// vista de trabajo diario al marcarla "entregado".
//
// La búsqueda es 100% en el cliente (spec: "que vayan apareciendo las
// coincidencias antes de completar el RUT"): se trae de una vez un lote
// grande de órdenes recientes y el filtrado, letra por letra, no vuelve a
// tocar el servidor.

export default async function BuscarOT() {
  const supabase = await createClient();

  const { data: ots } = await supabase
    .from("ordenes_trabajo")
    .select(
      "id, folio, estado, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2, fecha_ingreso, fecha_entrega_real, pacientes:paciente_id (nombre, rut)"
    )
    .order("fecha_ingreso", { ascending: false })
    .limit(500);

  const otIds = (ots ?? []).map((o) => o.id);
  const ventaPorOT: Record<string, { ventaId: string; total: number; saldo: number; fecha: string }> = {};
  if (otIds.length > 0) {
    const { data: itemsConVenta } = await supabase
      .from("venta_items")
      .select("ot_id, ventas:venta_id (id, total, fecha, pagos_abonos (monto))")
      .in("ot_id", otIds);
    for (const item of itemsConVenta ?? []) {
      const venta = item.ventas as unknown as {
        id: string;
        total: number;
        fecha: string;
        pagos_abonos: { monto: number }[];
      } | null;
      if (!venta || !item.ot_id) continue;
      const abonado = (venta.pagos_abonos ?? []).reduce((s, p) => s + p.monto, 0);
      ventaPorOT[item.ot_id] = { ventaId: venta.id, total: venta.total, saldo: venta.total - abonado, fecha: venta.fecha };
    }
  }

  return <BuscarOTCliente ots={(ots ?? []) as unknown as OTConDatos[]} ventaPorOT={ventaPorOT} />;
}
