import { esPilotoTerreno } from "@/lib/piloto-terreno";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaConDia, hoyEnChile, inicioDelDia, finDelDia, rangoHorario, sumarDias } from "@/lib/fechas";
import { leerTodas } from "@/lib/leer-todas";
import { cargarAgenda } from "@/lib/agenda-servidor";
import { diaBreve, mostrarFechas, rangosDisponibles, RUTA_AGENDA, urlAgenda } from "@/lib/agenda";
import { disponibleTrasPendientes, resumirCaja } from "@/lib/caja";
import { cargarPendientes } from "@/lib/resumen-pendientes";
import { pendientePersonal } from "@/lib/caja-fuentes";

const ACCESOS = [
  { href: "/ventas", titulo: "Vender", icono: "🛒", clase: "bg-brand text-white" },
  { href: "/cobros", titulo: "Cobrar", icono: "💵", clase: "bg-emerald-800 text-white" },
  { href: "/pacientes", titulo: "Paciente / receta", icono: "👁️", clase: "bg-tinta text-white" },
  { href: "/operativos", titulo: "Operativos", icono: "📍", clase: "bg-white text-tinta" },
];

async function saldoDisponible(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const [caja, pendientes, tenant, gastos, devoluciones] = await Promise.all([
    supabase.rpc("caja_global").single(),
    cargarPendientes(supabase),
    supabase.from("tenants").select("comision_debito_pct,comision_credito_pct").eq("id", tenantId).single(),
    leerTodas((a, b) => supabase.from("gastos_globales").select("id,monto")
      .eq("tenant_id", tenantId).eq("caja", "personal").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("caja_movimientos").select("id,gasto_id,monto")
      .eq("tenant_id", tenantId).not("gasto_id", "is", null).order("id").range(a, b)),
  ]);
  if (caja.error || !caja.data || pendientes.error || tenant.error || gastos.error || devoluciones.error) return null;
  const t = caja.data as {
    entro_efectivo: number; entro_digital: number; entro_debito: number;
    entro_credito: number; salio_efectivo: number; salio_digital: number;
  };
  const saldo = resumirCaja({
    entroEfectivo: t.entro_efectivo, entroDigital: t.entro_digital,
    entroDebito: t.entro_debito, entroCredito: t.entro_credito,
    salioEfectivo: t.salio_efectivo, salioDigital: t.salio_digital,
  }, {
    comisionDebitoPct: Number(tenant.data?.comision_debito_pct ?? 0),
    comisionCreditoPct: Number(tenant.data?.comision_credito_pct ?? 0),
  });
  const deuda = (gastos.data ?? []).reduce((suma, g) =>
    suma + pendientePersonal(g.monto, (devoluciones.data ?? []).filter(d => d.gasto_id === g.id)), 0);
  return disponibleTrasPendientes(saldo, { pagos: pendientes.resumen.total, devoluciones: deuda, ahorro: pendientes.resumen.ahorro }).restante;
}

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("rol,tenant_id").eq("id", user.id).single();
  if (perfil?.rol === "ventas") redirect("/ventas");
  if (perfil?.rol === "clinico") redirect("/pacientes");
  if (perfil?.rol === "bodega") redirect("/ot");
  if (perfil?.rol !== "admin") redirect("/login");

  if (esPilotoTerreno(perfil.tenant_id)) return <div className="space-y-5">
    <div><p className="text-sm font-semibold text-accent-dark">Visión Herrante</p><h1 className="text-2xl font-bold">¿Dónde vas a trabajar?</h1></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/ventas" className="rounded-2xl bg-brand p-5 text-white shadow-sm"><b className="block text-lg">En sucursal</b><span className="text-sm">Abrir punto de venta →</span></Link>
      <Link href="/agenda/equipos" className="rounded-2xl bg-sky-800 p-5 text-white shadow-sm"><b className="block text-lg">En terreno</b><span className="text-sm">Ver agenda, personal y kits →</span></Link>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[{href:"/pacientes",titulo:"Pacientes y recetas"},{href:"/cobros",titulo:"Cobros"},{href:"/entregas",titulo:"Entregas"},{href:"/inventario",titulo:"Inventario"}].map(b=><Link key={b.href} href={b.href} className="rounded-xl bg-white p-3 text-sm font-semibold shadow-sm">{b.titulo}</Link>)}</div>
  </div>;
  const hoy = hoyEnChile();
  const hasta = sumarDias(hoy, 90);
  const [ventas, entregas, agenda, caja] = await Promise.all([
    leerTodas((a, b) => supabase.from("ventas").select("id,total").eq("anulada", false)
      .gte("fecha", inicioDelDia(hoy)).lte("fecha", finDelDia(hoy)).order("id").range(a, b)),
    supabase.from("ordenes_trabajo").select("id", { count: "exact", head: true }).eq("estado", "listo"),
    cargarAgenda(supabase, perfil.tenant_id, hoy, hasta),
    saldoDisponible(supabase, perfil.tenant_id),
  ]);
  const libres = agenda.error ? [] : rangosDisponibles(agenda.disponibilidad, agenda.eventos, hoy, hasta).slice(0, 2);
  const proximos = agenda.eventos.filter(o => o.estado === "confirmado" || o.estado === "pendiente");
  const porConfirmar = proximos.filter(o => o.tipo === "propio" && o.estado === "pendiente");
  const totalVentas = (ventas.data ?? []).reduce((s, v) => s + v.total, 0);

  return <div className="flex flex-col gap-4">
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{fechaConDia(hoy)}</p>
        <h1 className="mt-1 text-3xl font-bold">Inicio</h1>
        <p className="text-sm text-tinta-suave">{agenda.nombreOptica} · Resumen del día</p>
      </div>
      <p className="text-sm text-tinta-suave">Ventas hoy <b className="text-emerald-800">{ventas.error ? "No disponible" : clp(totalVentas)}</b></p>
    </header>

    <section className="rounded-2xl bg-sky-900 text-white shadow-sm">
      <Link href={RUTA_AGENDA} className="flex items-center gap-3 rounded-t-2xl px-4 pb-2 pt-4">
        <svg aria-hidden="true" className="size-7 shrink-0 rounded-md bg-sky-700 p-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18m-13 4h2m4 0h2m-8 3h2" />
        </svg>
        <span className="text-xl font-bold">Calendario</span><span aria-hidden="true" className="ml-auto text-sky-100">→</span>
      </Link>
      <div className="px-4 pb-4">
        <p className="text-sm text-sky-100">{agenda.error ? "Disponibilidad temporalmente inaccesible" : "Próximas fechas disponibles"}</p>
        {libres.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">
          {libres.map(b => <Link key={b.fecha} href={urlAgenda(b.fecha, { ver: "disponibilidad" })} className="rounded-lg bg-sky-800 px-3 py-2 text-xs font-semibold capitalize">
            <span aria-hidden="true" className="mr-1 text-green-300">●</span> {mostrarFechas(b)}
          </Link>)}
        </div> : !agenda.error && <Link href={urlAgenda(hoy, { nuevo: "disponible" })} className="mt-1 inline-block rounded-lg bg-sky-800 px-3 py-2 text-xs font-semibold">Agregar disponibilidad →</Link>}
      </div>
    </section>

    <div className="grid grid-cols-2 gap-3">
      <Link href="/entregas" className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-brand-dark">📦 Entrega</p>
        <p className="my-1 text-xl font-bold tabular-nums">{entregas.error ? "—" : entregas.count ?? 0}</p>
        <p className="text-xs text-tinta-suave">{entregas.error ? "No disponible" : "Órdenes listas para entregar"}</p>
      </Link>
      <Link href="/caja" className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-sky-900">💰 Caja</p>
        <p className={`my-1 text-xl font-bold tabular-nums ${caja != null && caja < 0 ? "text-red-700" : ""}`}>{caja === null ? "—" : clp(caja)}</p>
        <p className="text-xs text-tinta-suave">{caja === null ? "No disponible" : "Disponible tras pendientes"}</p>
      </Link>
    </div>

    {!agenda.error && <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold">Próximos operativos</h2>
        <Link href={RUTA_AGENDA} className="text-xs font-semibold text-brand-dark">Ver agenda</Link>
      </div>
      {proximos.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Sin operativos próximos.</p>}
      <ul className="mt-1 divide-y divide-tinta/10">
        {proximos.slice(0, 3).map(o => {
          const dia = o.fecha < hoy ? hoy : o.fecha;
          return <li key={o.id}><Link href={urlAgenda(dia)} className="flex items-center gap-3 py-3">
            <span className={`shrink-0 rounded-lg px-2 py-2 text-xs font-bold capitalize ${o.tipo === "propio" ? "bg-orange-100 text-orange-950" : "bg-sky-100 text-sky-950"}`}>{diaBreve(dia)}</span>
            <span className="min-w-0"><b className="block break-words text-sm">{o.nombre}</b>
              <span className="block break-words text-xs text-tinta-suave">{[o.optica, o.direccion, (o.tipo === "propio" ? rangoHorario(o.hora_inicio, o.hora_fin) : mostrarFechas(o))].filter(Boolean).join(" · ")}</span>
            </span>
            <span aria-hidden="true" className="ml-auto text-tinta-suave">›</span>
          </Link></li>;
        })}
      </ul>
    </section>}
    {porConfirmar.length > 0 && <Link href={urlAgenda(porConfirmar[0].fecha < hoy ? hoy : porConfirmar[0].fecha)} className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950">
      {porConfirmar.length} {porConfirmar.length === 1 ? "operativo" : "operativos"} de {agenda.nombreOptica} por confirmar →
    </Link>}

    <nav aria-label="Accesos de trabajo" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {ACCESOS.map(b => <Link key={b.href} href={b.href} className={`flex items-center gap-2 rounded-xl p-3 text-sm font-semibold shadow-sm ${b.clase}`}>
        <span aria-hidden="true">{b.icono}</span>{b.titulo}
      </Link>)}
    </nav>
  </div>;
}
