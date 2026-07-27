import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";

// Historial completo de órdenes de trabajo (spec: garantía y refacción de
// cristales). El tablero de /ot solo muestra las que están en proceso; acá
// se busca cualquiera, incluidas las entregadas hace tiempo, por folio o
// por nombre/RUT del paciente — la OT nunca se borra, solo se saca de la
// vista de trabajo diario al marcarla "entregado".

const ESTADOS: Record<string, { label: string; clase: string }> = {
  recepcion: { label: "Recepción", clase: "bg-sky-100 text-sky-800" },
  laboratorio: { label: "Laboratorio", clase: "bg-amber-100 text-amber-800" },
  montaje: { label: "Montaje", clase: "bg-amber-100 text-amber-800" },
  listo: { label: "Listo", clase: "bg-brand/15 text-brand-dark" },
  entregado: { label: "Entregado", clase: "bg-green-100 text-green-700" },
};

export default async function BuscarOT({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const supabase = await createClient();

  let ots: Array<{
    id: string;
    folio: number;
    estado: string;
    tipo_lente: string | null;
    tratamiento: string | null;
    fecha_ingreso: string;
    fecha_entrega_real: string | null;
    pacientes: { nombre: string; rut: string | null } | null;
  }> = [];

  if (query) {
    const esFolio = /^\d+$/.test(query);
    if (esFolio) {
      const { data } = await supabase
        .from("ordenes_trabajo")
        .select("id, folio, estado, tipo_lente, tratamiento, fecha_ingreso, fecha_entrega_real, pacientes:paciente_id (nombre, rut)")
        .eq("folio", Number(query))
        .order("fecha_ingreso", { ascending: false });
      ots = (data ?? []) as unknown as typeof ots;
    } else {
      const rutFormateado = formatearRut(query);
      const { data: pacientes } = await supabase
        .from("pacientes")
        .select("id")
        .or(`nombre.ilike.%${query}%,rut.ilike.%${rutFormateado || query}%`);
      const idsPaciente = (pacientes ?? []).map((p) => p.id);
      if (idsPaciente.length > 0) {
        const { data } = await supabase
          .from("ordenes_trabajo")
          .select("id, folio, estado, tipo_lente, tratamiento, fecha_ingreso, fecha_entrega_real, pacientes:paciente_id (nombre, rut)")
          .in("paciente_id", idsPaciente)
          .order("fecha_ingreso", { ascending: false });
        ots = (data ?? []) as unknown as typeof ots;
      }
    }
  }

  const otIds = ots.map((o) => o.id);
  const ventaPorOT = new Map<string, { ventaId: string; total: number; saldo: number; fecha: string }>();
  if (otIds.length > 0) {
    const { data: itemsConVenta } = await supabase
      .from("venta_items")
      .select("ot_id, ventas:venta_id (id, total, fecha, pagos_abonos (monto))")
      .in("ot_id", otIds);
    for (const item of itemsConVenta ?? []) {
      const venta = item.ventas as unknown as {
        id: string; total: number; fecha: string; pagos_abonos: { monto: number }[];
      } | null;
      if (!venta || !item.ot_id) continue;
      const abonado = (venta.pagos_abonos ?? []).reduce((s, p) => s + p.monto, 0);
      ventaPorOT.set(item.ot_id, { ventaId: venta.id, total: venta.total, saldo: venta.total - abonado, fecha: venta.fecha });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Buscar orden de trabajo</h1>
        <Link href="/ot" className="text-sm font-medium text-brand-dark hover:underline">
          ← Volver al tablero
        </Link>
      </div>

      <form action="/ot/buscar" className="flex gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Folio de la OT o nombre/RUT del paciente"
          className="flex-1 rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
        />
        <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
          Buscar
        </button>
      </form>

      {query && ots.length === 0 && (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          No se encontró ninguna orden de trabajo para &quot;{query}&quot;.
        </p>
      )}

      {ots.length > 0 && (
        <ul className="flex flex-col gap-2">
          {ots.map((ot) => {
            const estado = ESTADOS[ot.estado] ?? ESTADOS.recepcion;
            const venta = ventaPorOT.get(ot.id);
            return (
              <li key={ot.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/ot/${ot.id}`} className="font-bold text-brand-dark hover:underline">
                    OT #{ot.folio}
                  </Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>
                    {estado.label}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{ot.pacientes?.nombre ?? "—"}</span>
                  {ot.pacientes?.rut && (
                    <span className="text-xs text-tinta-suave">{formatearRut(ot.pacientes.rut)}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-tinta-suave">
                  {[ot.tipo_lente, ot.tratamiento].filter(Boolean).join(" · ") || "Sin detalle de cristal"}
                </p>
                <p className="mt-1 text-xs text-tinta-suave">
                  Ingreso: {new Date(ot.fecha_ingreso).toLocaleDateString("es-CL")}
                  {ot.fecha_entrega_real && (
                    <> · Entregado: {new Date(ot.fecha_entrega_real).toLocaleDateString("es-CL")}</>
                  )}
                  {venta && (
                    <>
                      {" "}· Compra del {new Date(venta.fecha).toLocaleDateString("es-CL")} por {clp(venta.total)}
                      {venta.saldo > 0 && <> (saldo {clp(venta.saldo)})</>}
                    </>
                  )}
                </p>
                {venta && (
                  <Link
                    href={`/ventas/${venta.ventaId}/comprobante`}
                    className="mt-1 inline-block text-xs font-medium text-brand-dark hover:underline"
                  >
                    🖨 Ver comprobante de esa compra
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
