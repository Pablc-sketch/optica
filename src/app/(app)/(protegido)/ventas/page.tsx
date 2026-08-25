import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { registrarAbono } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import PuntoDeVenta from "./pos";

const ESTADO_PAGO: Record<string, { label: string; clase: string }> = {
  pendiente: { label: "Pendiente", clase: "bg-red-100 text-red-700" },
  abono_parcial: { label: "Abono parcial", clase: "bg-amber-100 text-amber-700" },
  pagada: { label: "Pagada", clase: "bg-green-100 text-green-700" },
};

export default async function VentasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [pacientesRes, productosRes, costosRes, tenantRes, ventasRes, perfilRes, sucursalRes, recetasRes, laboratoriosRes, operativosRes] = await Promise.all([
    supabase.from("pacientes").select("id, nombre, rut").order("nombre").limit(200),
    supabase
      .from("productos")
      .select("id, nombre, marca, precio_venta")
      .order("marca")
      .limit(200),
    supabase
      .from("costos_cristales")
      .select("tipo_lente, rango_receta, tratamiento, costo, precio_venta")
      .order("tipo_lente"),
    supabase.from("tenants").select("factor_venta_cristales").single(),
    supabase
      .from("ventas")
      .select("id, fecha, total, estado_pago, pacientes:paciente_id (nombre), pagos_abonos (monto)")
      .order("fecha", { ascending: false })
      .limit(20),
    supabase.from("users").select("tenant_id").eq("id", user!.id).single(),
    supabase.from("sucursales").select("id").order("created_at").limit(1).maybeSingle(),
    supabase.from("recetas").select("id, paciente_id, fecha").order("fecha", { ascending: false }),
    supabase.from("proveedores").select("id, nombre").eq("tipo", "laboratorio").order("nombre"),
    // Independiente del selector de sucursal (que es para stock físico):
    // planificados/realizados más recientes primero.
    supabase
      .from("operativos")
      .select("id, nombre, fecha")
      .in("estado", ["planificado", "realizado"])
      .order("fecha", { ascending: false }),
  ]);

  const ventas = ventasRes.data ?? [];

  // Última receta por paciente: la OT creada desde el POS la enlaza sola,
  // también cuando la venta se captura sin conexión.
  const ultimaRecetaPorPaciente: Record<string, string> = {};
  for (const r of recetasRes.data ?? []) {
    if (!ultimaRecetaPorPaciente[r.paciente_id]) ultimaRecetaPorPaciente[r.paciente_id] = r.id;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-4 text-xl font-bold">Punto de venta</h1>
        <PuntoDeVenta
          pacientes={pacientesRes.data ?? []}
          productos={productosRes.data ?? []}
          costos={costosRes.data ?? []}
          laboratorios={laboratoriosRes.data ?? []}
          factorVenta={tenantRes.data?.factor_venta_cristales ?? 6}
          tenantId={perfilRes.data?.tenant_id ?? ""}
          sucursalId={sucursalRes.data?.id ?? null}
          vendedorId={user?.id ?? null}
          ultimaRecetaPorPaciente={ultimaRecetaPorPaciente}
          operativos={operativosRes.data ?? []}
        />
      </div>

      <section>
        <h2 className="mb-3 font-semibold">Últimas ventas</h2>
        {ventas.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin ventas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ventas.map((v) => {
              const abonado = (v.pagos_abonos ?? []).reduce((s: number, p: { monto: number }) => s + p.monto, 0);
              const saldo = v.total - abonado;
              const estado = ESTADO_PAGO[v.estado_pago] ?? ESTADO_PAGO.pendiente;
              return (
                <li key={v.id} className="rounded-xl bg-crema-claro px-4 py-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-tinta-suave">
                      {new Date(v.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    </span>
                    <span className="flex-1 truncate text-sm font-medium">
                      {(v.pacientes as unknown as { nombre: string } | null)?.nombre ?? "Sin paciente"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>
                      {estado.label}
                    </span>
                    <span className="font-bold">{clp(v.total)}</span>
                    <Link
                      href={`/ventas/${v.id}/comprobante`}
                      className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium text-tinta-suave transition hover:bg-white"
                    >
                      🖨 Comprobante
                    </Link>
                  </div>
                  {saldo > 0 && (
                    <form action={registrarAbono} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="venta_id" value={v.id} />
                      <span className="text-xs text-tinta-suave">Saldo: <b>{clp(saldo)}</b></span>
                      <input
                        name="monto"
                        inputMode="numeric"
                        placeholder="Monto"
                        className="w-24 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                      />
                      <select name="medio_pago" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand">
                        <option value="efectivo">Efectivo</option>
                        <option value="debito">Débito</option>
                        <option value="credito">Crédito</option>
                        <option value="transferencia">Transferencia</option>
                      </select>
                      <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                        Abonar
                      </button>
                    </form>
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
