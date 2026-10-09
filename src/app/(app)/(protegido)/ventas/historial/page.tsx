import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { formatearTelefono } from "@/lib/formato";
import AbonoForm from "@/components/abono-form";
import AnularVenta from "../anular-venta";

// El número tocable: en el celular abre el marcador con el número puesto,
// que es como se usa de verdad en el mesón — nadie copia un teléfono a
// mano para llamar. Cuando falta, se dice, para poder pedirlo ahí mismo
// en vez de descubrirlo al querer llamar.
function TelefonoPaciente({ telefono }: { telefono: string | null }) {
  const digitos = String(telefono ?? "").replace(/\D/g, "");
  if (digitos.length < 8) {
    return <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-xs text-neutral-600">Sin teléfono</span>;
  }
  return (
    <a
      href={`tel:+${digitos.startsWith("56") ? digitos : `56${digitos}`}`}
      className="rounded-full bg-sky-700 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-sky-800"
    >
      📞 {formatearTelefono(telefono)}
    </a>
  );
}

const ESTADO_PAGO: Record<string, { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-red-100 text-red-700" },
  abono_parcial: { label: "Abono parcial", clase: "bg-amber-100 text-amber-700" },
  pagada: { label: "Pagada", clase: "bg-green-100 text-green-700" },
};

// Historial de ventas (editar, anular, comprobante). Antes estaba debajo
// del punto de venta y hacía esa pantalla lenta y recargada.
export default async function HistorialVentas() {
  const supabase = await createClient();
  const ventasRes = await supabase
    .from("ventas")
    .select(
      `id, fecha, total, estado_pago, anulada, anulada_motivo,
       pacientes:paciente_id (nombre, telefono), pagos_abonos (monto),
       venta_items (cristal_slot, ordenes_trabajo:ot_id (estado))`
    )
    .order("fecha", { ascending: false })
    .limit(60);
  const ventas = ventasRes.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">Historial de ventas</h1>
        <Link href="/ventas" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          ＋ Nueva venta
        </Link>
      </div>
      {ventasRes.error && (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          No se pudieron leer las ventas. Recarga la página.
        </p>
      )}
      <section>
        <h2 className="mb-3 font-semibold">Últimas 60 ventas</h2>
        {ventas.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin ventas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ventas.map((v) => {
              const abonado = (v.pagos_abonos ?? []).reduce((s: number, p: { monto: number }) => s + p.monto, 0);
              const saldo = v.total - abonado;
              const estado = ESTADO_PAGO[v.estado_pago] ?? ESTADO_PAGO.pendiente;
              // Al marcar una orden como entregada desaparece de la lista
              // de pendientes — que es lo correcto para la cola de
              // trabajo, pero en medio de una entrega deja la duda de si
              // quedó guardada. Acá se ve el estado de las órdenes de
              // cada venta, para poder confirmarlo de una mirada.
              const totalOts = (v.venta_items ?? []).filter((i) => i.cristal_slot !== null).length;
              const entregadas = (v.venta_items ?? []).filter((i) => {
                const rel = (i as { ordenes_trabajo?: unknown }).ordenes_trabajo;
                const filas = (Array.isArray(rel) ? rel : rel ? [rel] : []) as { estado: string }[];
                return filas.some((f) => f.estado === "entregado");
              }).length;
              const todoEntregado = totalOts > 0 && entregadas === totalOts;
              const entregaParcial = entregadas > 0 && !todoEntregado;
              return (
                <li key={v.id} className={`rounded-xl px-4 py-3 shadow-sm ${v.anulada ? "bg-neutral-100 opacity-70" : "bg-crema-claro"}`}>
                  {/* Nombre completo arriba, en su propia línea (en el celular
                      se cortaba); debajo, lo que abonó y lo que debe. */}
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-base font-semibold break-words">
                      {(v.pacientes as unknown as { nombre: string } | null)?.nombre ?? "Sin paciente"}
                    </span>
                    <span className="shrink-0 text-xs text-tinta-suave">
                      {new Date(v.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  {!v.anulada && (
                    <p className="mt-0.5 text-sm tabular-nums">
                      Total <b>{clp(v.total)}</b> · Abonó <b>{clp(abonado)}</b>
                      {saldo > 0 ? (
                        <>
                          {" "}
                          · <b className="text-red-700">Debe {clp(saldo)}</b>
                        </>
                      ) : (
                        <span className="font-semibold text-green-700"> · Pagado</span>
                      )}
                    </p>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {!v.anulada && (
                      <TelefonoPaciente
                        telefono={(v.pacientes as unknown as { telefono: string | null } | null)?.telefono ?? null}
                      />
                    )}
                    {v.anulada ? (
                      <span className="rounded-full bg-neutral-300 px-2.5 py-0.5 text-xs font-semibold text-neutral-700">
                        Anulada
                      </span>
                    ) : (
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>
                        {estado.label}
                      </span>
                    )}
                    {/* Fondo lleno y no pastel como los demás: en pleno
                        mesón hay que poder confirmar de un vistazo, sin
                        acercarse a leer. */}
                    {!v.anulada && todoEntregado && (
                      <span className="rounded-full bg-green-600 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
                        ✓ Entregado
                      </span>
                    )}
                    {!v.anulada && entregaParcial && (
                      <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
                        Entregado {entregadas} de {totalOts}
                      </span>
                    )}
                    {v.anulada && <span className="font-bold">{clp(v.total)}</span>}
                    <Link
                      href={`/ventas/${v.id}/comprobante`}
                      className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium text-tinta-suave transition hover:bg-white"
                    >
                      🖨 Comprobante
                    </Link>
                    {!v.anulada && (
                      <Link
                        href={`/ventas/${v.id}`}
                        className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium text-tinta-suave transition hover:bg-white"
                      >
                        ✎ Editar
                      </Link>
                    )}
                    {!v.anulada && <AnularVenta ventaId={v.id} compacto />}
                  </div>
                  {v.anulada && v.anulada_motivo && (
                    <p className="mt-1 text-xs italic text-tinta-suave">Motivo: {v.anulada_motivo}</p>
                  )}
                  {!v.anulada && saldo > 0 && (
                    <div className="mt-2">
                      <AbonoForm ventaId={v.id} saldo={saldo} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
