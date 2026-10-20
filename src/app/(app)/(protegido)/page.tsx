import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, hoyEnChile, inicioDelDia } from "@/lib/fechas";

const ESTADOS_OT: Record<string, string> = {
  recepcion: "Recepción",
  laboratorio: "Laboratorio",
  montaje: "Montaje",
  listo: "Listo",
};

export default async function Dashboard() {
  const supabase = await createClient();

  // El rol "ventas" (vendedoras de mesón) solo necesita órdenes y ventas —
  // este panel muestra cifras de negocio (venta del día, stock) que no le
  // corresponden, así que se manda directo a lo suyo.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfil?.rol === "ventas") redirect("/ventas");

  const hoy = hoyEnChile();
  const [ventasHoy, otsPendientes, proximoOperativo, ventasRes, operativosRes, pagosSueldoRes] = await Promise.all([
    supabase.from("ventas").select("total").eq("anulada", false).gte("fecha", inicioDelDia(hoy)),
    supabase
      .from("ordenes_trabajo")
      .select("id, folio, estado, fecha_entrega_estimada, costo_laboratorio, costo_laboratorio_2, pacientes:paciente_id (nombre)")
      .not("estado", "in", "(entregado,cancelado)")
      .order("fecha_ingreso", { ascending: true }),
    supabase
      .from("operativos")
      .select("id, nombre, fecha")
      .eq("estado", "planificado")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.from("ventas").select("total, pagos_abonos (monto)").eq("anulada", false).limit(3000),
    supabase.from("operativos").select("id, nombre, fecha").lte("fecha", hoy).neq("estado", "cancelado").order("fecha", { ascending: false }).limit(20),
    supabase.from("retiros_sueldo").select("operativo_id").eq("es_sueldo", true).not("operativo_id", "is", null),
  ]);

  const totalHoy = (ventasHoy.data ?? []).reduce((s, v) => s + v.total, 0);
  const ots = otsPendientes.data ?? [];
  const listos = ots.filter((o) => o.estado === "listo");
  const porEnviar = ots.filter((o) => o.estado === "recepcion");
  const totalFides = porEnviar.reduce((s, o) => s + (o.costo_laboratorio ?? 0) + (o.costo_laboratorio_2 ?? 0), 0);
  const porCobrar = (ventasRes.data ?? []).reduce(
    (s, v) => s + Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((a: number, p: { monto: number }) => a + p.monto, 0)),
    0
  );
  // Operativos que ya pasaron y todavía no tienen ningún sueldo marcado
  // como pagado: hay que cerrarlos para que la caja cuadre.
  const cerrados = new Set((pagosSueldoRes.data ?? []).map((r) => r.operativo_id));
  const porCerrar = (operativosRes.data ?? []).filter((o) => !cerrados.has(o.id));
  const proximo = proximoOperativo.data;

  const pendiente = (href: string, titulo: string, valor: string, detalle: string, alerta: boolean) => (
    <Link
      href={href}
      className={`flex flex-col rounded-2xl p-4 shadow-sm transition hover:shadow-md ${alerta ? "bg-white" : "bg-white/60"}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">{titulo}</span>
      <span className={`text-2xl font-bold tabular-nums ${alerta ? "text-tinta" : "text-tinta-suave"}`}>{valor}</span>
      <span className="text-sm text-tinta-suave">{detalle}</span>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Hola 👋</h1>
        <p className="text-sm text-tinta-suave">
          Vendido hoy: <b className="text-tinta">{clp(totalHoy)}</b>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { href: "/ventas", titulo: "Vender", icono: "🛒", clase: "bg-brand text-white" },
          { href: "/cobros", titulo: "Cobrar y entregar", icono: "💵", clase: "bg-emerald-800 text-white" },
          { href: "/pacientes", titulo: "Paciente / receta", icono: "👁️", clase: "bg-tinta text-white" },
          { href: "/avisos", titulo: "Avisar entrega", icono: "💬", clase: "bg-white text-tinta" },
        ].map((b) => (
          <Link key={b.href} href={b.href} className={`flex flex-col gap-1 rounded-2xl p-4 shadow-sm ${b.clase}`}>
            <span className="text-2xl" aria-hidden>
              {b.icono}
            </span>
            <span className="text-base font-bold">{b.titulo}</span>
          </Link>
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Pendiente</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {pendiente("/cobros?op=todos&ver=deben", "Por cobrar", clp(porCobrar), "saldos de clientes", porCobrar > 0)}
          {pendiente("/cobros?op=todos&ver=listos", "Listos para entregar", String(listos.length), "lentes esperando", listos.length > 0)}
          {pendiente("/laboratorio", "Por enviar a Fides", String(porEnviar.length), porEnviar.length ? `${clp(totalFides)} a pagar` : "nada pendiente", porEnviar.length > 0)}
          {pendiente(
            porCerrar[0] ? `/operativos/${porCerrar[0].id}/cierre` : "/operativos",
            "Repartos por anotar",
            String(porCerrar.length),
            porCerrar[0] ? `${porCerrar[0].nombre}` : "todo pagado",
            porCerrar.length > 0
          )}
        </div>
        {porCerrar.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            En cada operativo, anota en &quot;Reparto y pagos&quot; a quién le pagaste: así la plata que muestra la app es la que de verdad queda en la
            cuenta. Anotar el reparto no borra lo que falta cobrar.
          </p>
        )}
      </section>

      {proximo && (
        <Link href={`/operativos/${proximo.id}`} className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-800">Próximo operativo</span>
          <span className="block text-lg font-bold text-sky-950">{proximo.nombre}</span>
          <span className="text-sm text-sky-800">{fechaLegible(proximo.fecha)}</span>
        </Link>
      )}

      {ots.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">Órdenes en curso</h2>
          <ul className="flex flex-col gap-2">
            {ots.slice(0, 6).map((ot) => (
              <li key={ot.id} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 shadow-sm">
                <span className="text-xs font-bold text-tinta-suave">#{ot.folio}</span>
                <span className="min-w-0 flex-1 break-words text-sm font-medium">
                  {(ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—"}
                </span>
                <span className="rounded-full bg-crema px-2.5 py-0.5 text-xs font-semibold">{ESTADOS_OT[ot.estado] ?? ot.estado}</span>
              </li>
            ))}
          </ul>
          <Link href="/ot" className="text-sm font-semibold text-brand-dark underline">
            Ver todas las órdenes →
          </Link>
        </section>
      )}
    </div>
  );
}
