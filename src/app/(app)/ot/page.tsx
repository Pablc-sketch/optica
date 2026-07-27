import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { avanzarOT } from "@/lib/actions/ot";
import { registrarAbono } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";

const COLUMNAS = [
  { estado: "recepcion", titulo: "Recepción", accion: "→ Laboratorio" },
  { estado: "laboratorio", titulo: "Laboratorio", accion: "→ Montaje" },
  { estado: "montaje", titulo: "Montaje", accion: "→ Listo" },
  { estado: "listo", titulo: "Listo", accion: "Entregar ✓" },
] as const;

export default async function TableroOT() {
  const supabase = await createClient();

  const [otsRes, tenantRes] = await Promise.all([
    supabase
      .from("ordenes_trabajo")
      .select(
        "id, folio, estado, tipo_lente, tratamiento, fecha_entrega_estimada, pacientes:paciente_id (nombre, telefono)"
      )
      .neq("estado", "entregado")
      .order("fecha_ingreso", { ascending: true }),
    supabase.from("tenants").select("nombre_comercial").single(),
  ]);
  const ots = otsRes.data;
  const nombreOptica = tenantRes.data?.nombre_comercial ?? "la óptica";

  // La OT no sabe de plata; la venta que la creó sí. Buscamos, para cada OT
  // de este tablero, la venta enlazada y cuánto le falta pagar, así al
  // entregar los lentes se ve altiro si queda saldo pendiente por cobrar.
  const otIds = (ots ?? []).map((o) => o.id);
  const ventaPorOT = new Map<string, { ventaId: string; saldo: number }>();
  if (otIds.length > 0) {
    const { data: itemsConVenta } = await supabase
      .from("venta_items")
      .select("ot_id, ventas:venta_id (id, total, pagos_abonos (monto))")
      .in("ot_id", otIds);

    for (const item of itemsConVenta ?? []) {
      const venta = item.ventas as unknown as { id: string; total: number; pagos_abonos: { monto: number }[] } | null;
      if (!venta || !item.ot_id) continue;
      const abonado = (venta.pagos_abonos ?? []).reduce((s, p) => s + p.monto, 0);
      ventaPorOT.set(item.ot_id, { ventaId: venta.id, saldo: venta.total - abonado });
    }
  }

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
                  const paciente = ot.pacientes as unknown as { nombre: string; telefono: string | null } | null;
                  const telefonoWsp = paciente?.telefono?.replace(/\D/g, "");
                  const venta = ventaPorOT.get(ot.id);
                  const saldo = venta?.saldo ?? 0;
                  const linkWsp =
                    col.estado === "listo" && telefonoWsp
                      ? `https://wa.me/${telefonoWsp.length === 9 ? "56" + telefonoWsp : telefonoWsp}?text=${encodeURIComponent(
                          `Hola ${paciente!.nombre.split(" ")[0]}! 👓 Le escribimos de ${nombreOptica}: sus lentes ya están listos para retirar (orden #${ot.folio}). ¡Los esperamos!`
                        )}`
                      : null;
                  return (
                    <article key={ot.id} className="rounded-xl bg-white p-3 shadow-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <Link href={`/ot/${ot.id}`} className="text-xs font-bold text-brand-dark hover:underline">
                          #{ot.folio} 🖨
                        </Link>
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
                      <p className="truncate text-sm font-medium">{paciente?.nombre ?? "—"}</p>
                      <p className="truncate text-xs text-tinta-suave">
                        {[ot.tipo_lente, ot.tratamiento].filter(Boolean).join(" · ")}
                      </p>
                      {saldo > 0 && (
                        <p className="mt-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                          Debe {clp(saldo)}
                        </p>
                      )}
                      {col.estado === "listo" && venta && saldo > 0 && (
                        <form action={registrarAbono} className="mt-2 flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="venta_id" value={venta.ventaId} />
                          <input
                            name="monto"
                            inputMode="numeric"
                            placeholder={`Cobrar hasta ${clp(saldo)}`}
                            className="w-28 flex-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                          />
                          <select name="medio_pago" className="rounded-lg border border-tinta-suave/30 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand">
                            <option value="efectivo">Efectivo</option>
                            <option value="debito">Débito</option>
                            <option value="credito">Crédito</option>
                            <option value="transferencia">Transferencia</option>
                          </select>
                          <button className="rounded-lg bg-brand/10 px-2 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                            Cobrar
                          </button>
                        </form>
                      )}
                      {col.estado === "listo" && venta && saldo <= 0 && (
                        <Link
                          href={`/ventas/${venta.ventaId}/comprobante`}
                          className="mt-2 block w-full rounded-lg border border-tinta-suave/30 px-2 py-1.5 text-center text-xs font-medium text-tinta-suave transition hover:bg-crema"
                        >
                          🖨 Pagado — ver comprobante
                        </Link>
                      )}
                      {linkWsp && (
                        <a
                          href={linkWsp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block w-full rounded-lg bg-green-600/10 px-2 py-1.5 text-center text-xs font-semibold text-green-700 transition hover:bg-green-600 hover:text-white"
                        >
                          💬 Avisar por WhatsApp
                        </a>
                      )}
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
