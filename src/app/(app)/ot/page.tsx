import { createClient } from "@/lib/supabase/server";
import { avanzarOT } from "@/lib/actions/ot";

const COLUMNAS = [
  { estado: "recepcion", titulo: "Recepción", accion: "→ Laboratorio" },
  { estado: "laboratorio", titulo: "Laboratorio", accion: "→ Montaje" },
  { estado: "montaje", titulo: "Montaje", accion: "→ Listo" },
  { estado: "listo", titulo: "Listo", accion: "Entregar ✓" },
] as const;

export default async function TableroOT() {
  const supabase = await createClient();

  const { data: ots } = await supabase
    .from("ordenes_trabajo")
    .select(
      "id, folio, estado, tipo_lente, tratamiento, fecha_entrega_estimada, pacientes:paciente_id (nombre)"
    )
    .neq("estado", "entregado")
    .order("fecha_ingreso", { ascending: true });

  const porEstado = (estado: string) => (ots ?? []).filter((o) => o.estado === estado);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">Órdenes de trabajo</h1>

      {/* Kanban: columnas con scroll horizontal en móvil/tablet (spec 8.3) */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNAS.map((col) => {
          const items = porEstado(col.estado);
          return (
            <section
              key={col.estado}
              className="flex w-64 shrink-0 flex-col gap-2 rounded-2xl bg-crema-claro p-3 shadow-sm"
            >
              <header className="flex items-center justify-between px-1">
                <h2 className="text-sm font-bold">{col.titulo}</h2>
                <span className="rounded-full bg-crema px-2 py-0.5 text-xs font-semibold text-tinta-suave">
                  {items.length}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-tinta-suave/25 p-3 text-center text-xs text-tinta-suave">
                  Vacío
                </p>
              ) : (
                items.map((ot) => {
                  const atrasada =
                    ot.fecha_entrega_estimada &&
                    new Date(ot.fecha_entrega_estimada + "T23:59:59") < new Date();
                  return (
                    <article key={ot.id} className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-bold text-brand-dark">#{ot.folio}</span>
                        {ot.fecha_entrega_estimada && (
                          <span className={`text-xs ${atrasada ? "font-bold text-red-600" : "text-tinta-suave"}`}>
                            {new Date(ot.fecha_entrega_estimada + "T00:00:00").toLocaleDateString("es-CL", {
                              day: "numeric",
                              month: "short",
                            })}
                            {atrasada ? " ⚠" : ""}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-sm font-medium">
                        {(ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—"}
                      </p>
                      <p className="truncate text-xs text-tinta-suave">
                        {[ot.tipo_lente, ot.tratamiento].filter(Boolean).join(" · ")}
                      </p>
                      <form action={avanzarOT} className="mt-2">
                        <input type="hidden" name="ot_id" value={ot.id} />
                        <input type="hidden" name="estado_actual" value={ot.estado} />
                        <button className="w-full rounded-lg bg-brand/10 px-2 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                          {col.accion}
                        </button>
                      </form>
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
