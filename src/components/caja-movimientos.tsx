import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, diaEnChile, inicioDelDia } from "@/lib/fechas";

export default async function CajaMovimientos() {
  const supabase = await createClient();
  const [cobros, gastos, retiros] = await Promise.all([
    supabase.from("pagos_abonos").select("id, fecha, monto, medio_pago, venta_id, ventas!inner(anulada)")
      .eq("ventas.anulada", false).order("fecha", { ascending: false }).order("id").limit(15),
    supabase.from("gastos_globales").select("id, fecha, monto, caja, descripcion, operativo_id")
      .order("fecha", { ascending: false }).order("id").limit(15),
    supabase.from("retiros_sueldo").select("id, fecha, monto, caja, persona, operativo_id")
      .order("fecha", { ascending: false }).order("id").limit(15),
  ]);
  if (cobros.error || gastos.error || retiros.error) return <p role="alert" className="text-sm text-red-700">No se pudieron leer los movimientos. Recarga.</p>;
  const nombres: Record<string, string> = { pablo: "Pablo", madre: "Pamela", isadora: "Isadora", ahorro: "Ahorro" };
  const instante = (f: string) => Date.parse(f.length === 10 ? inicioDelDia(f) : f);
  const movimientos = [
    ...(cobros.data ?? []).map((p) => ({ id: `c-${p.id}`, fecha: diaEnChile(p.fecha), orden: instante(p.fecha), monto: p.monto, titulo: "Cobro de venta", caja: !p.medio_pago || p.medio_pago === "efectivo" ? "Efectivo" : "Cuenta", href: `/ventas/${p.venta_id}` })),
    ...(gastos.data ?? []).map((p) => ({ id: `g-${p.id}`, fecha: p.fecha, orden: instante(p.fecha), monto: -p.monto, titulo: p.descripcion, caja: p.caja === "efectivo" ? "Efectivo" : "Cuenta", href: p.operativo_id ? `/operativos/${p.operativo_id}/cierre` : "/reportes" })),
    ...(retiros.data ?? []).map((p) => ({ id: `r-${p.id}`, fecha: p.fecha, orden: instante(p.fecha), monto: -p.monto, titulo: `${p.monto < 0 ? "Aporte" : "Retiro"} · ${nombres[p.persona] ?? p.persona}`, caja: p.caja === "efectivo" ? "Efectivo" : "Cuenta", href: p.operativo_id ? `/operativos/${p.operativo_id}/cierre` : "/reportes" })),
  ].sort((a, b) => b.orden - a.orden || a.id.localeCompare(b.id)).slice(0, 15);
  return <section className="mt-4 border-t border-tinta/10 pt-3">
    <h3 className="font-bold">Últimos movimientos</h3>
    {movimientos.length === 0 ? <p className="py-3 text-sm text-tinta-suave">Sin movimientos registrados.</p> : <ul className="divide-y divide-tinta/10">
      {movimientos.map((m) => <li key={m.id}><Link href={m.href} className="flex items-center justify-between gap-3 py-3">
        <span className="min-w-0"><span className="block break-words text-sm font-semibold">{m.titulo}</span><span className="text-xs text-tinta-suave">{fechaLegible(m.fecha.slice(0, 10))} · {m.caja}</span></span>
        <span className={`shrink-0 font-bold tabular-nums ${m.monto < 0 ? "text-red-700" : "text-emerald-800"}`}>{m.monto > 0 ? "+" : ""}{clp(m.monto)}</span>
      </Link></li>)}
    </ul>}
    <Link href="/reportes" className="mt-2 inline-block rounded-xl border px-4 py-2 font-semibold">Todos los movimientos →</Link>
  </section>;
}
