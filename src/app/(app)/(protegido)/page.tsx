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
import CabeceraPagina from "@/components/cabecera-pagina";
import Icono, { type NombreIcono } from "@/components/icono";

const ACCESOS: { href: string; titulo: string; icono: NombreIcono }[] = [
  { href: "/cobros", titulo: "Cobros", icono: "cobros" },
  { href: "/pacientes", titulo: "Pacientes y recetas", icono: "pacientes" },
  { href: "/entregas", titulo: "Entregas", icono: "entregas" },
  { href: "/inventario", titulo: "Inventario", icono: "inventario" },
];

function AccesosTrabajo() {
  return (
    <nav aria-label="Accesos de trabajo" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {ACCESOS.map(b => (
        <Link key={b.href} href={b.href} className="flex min-w-0 items-center gap-2 rounded-xl bg-white px-3 py-4 text-sm font-semibold shadow-sm hover:shadow-md">
          <Icono nombre={b.icono} className="size-5 shrink-0 text-accent-dark" />
          <span>{b.titulo}</span>
        </Link>
      ))}
    </nav>
  );
}

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

  if (esPilotoTerreno(perfil.tenant_id)) return (
    <div className="space-y-6">
      <CabeceraPagina seccion="Visión Herrante" titulo="¿Dónde vas a trabajar?" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/ventas" className="group flex min-h-40 flex-col items-start gap-2 rounded-2xl bg-white p-5 shadow-sm hover:shadow-md sm:p-6">
          <span className="rounded-xl bg-brand/10 p-2.5 text-brand-dark"><Icono nombre="venta" className="size-6" /></span>
          <span className="mt-auto text-xl font-bold">En sucursal</span>
          <span className="flex w-full items-center justify-between gap-2 text-sm text-tinta-suave">Abrir punto de venta <Icono nombre="flecha" className="size-5 text-brand-dark" /></span>
        </Link>
        <Link href="/agenda/equipos" className="group flex min-h-40 flex-col items-start gap-2 rounded-2xl bg-sidebar p-5 text-white shadow-sm hover:bg-sidebar-active sm:p-6">
          <span className="rounded-xl bg-white/10 p-2.5 text-white"><Icono nombre="agenda" className="size-6" /></span>
          <span className="mt-auto text-xl font-bold">En terreno</span>
          <span className="flex w-full items-center justify-between gap-2 text-sm text-sidebar-text">Agenda, personal y kits <Icono nombre="flecha" className="size-5" /></span>
        </Link>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Accesos rápidos</h2>
        <AccesosTrabajo />
      </section>
    </div>
  );
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

  return <div className="flex flex-col gap-5">
    <CabeceraPagina seccion={fechaConDia(hoy)} titulo="Inicio" acciones={
      <Link href="/ventas" className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
        <Icono nombre="venta" className="size-5" /> Nueva venta
      </Link>
    } />

    <div className="grid gap-3 min-[400px]:grid-cols-2 xl:grid-cols-3">
      <Link href="/ventas/historial" className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-dark"><Icono nombre="venta" className="size-4" /> Ventas hoy</p>
        <p className="my-1 text-2xl font-bold tabular-nums">{ventas.error ? "—" : clp(totalVentas)}</p>
        <p className="text-xs text-tinta-suave">{ventas.error ? "No disponible" : "Ver historial de ventas"}</p>
      </Link>
      <Link href="/entregas" className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-dark"><Icono nombre="entregas" className="size-4" /> Entregas</p>
        <p className="my-1 text-2xl font-bold tabular-nums">{entregas.error ? "—" : entregas.count ?? 0}</p>
        <p className="text-xs text-tinta-suave">{entregas.error ? "No disponible" : "Órdenes listas para entregar"}</p>
      </Link>
      <Link href="/caja" className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-dark"><Icono nombre="caja" className="size-4" /> Caja</p>
        <p className={`my-1 text-2xl font-bold tabular-nums ${caja != null && caja < 0 ? "text-red-700" : ""}`}>{caja === null ? "—" : clp(caja)}</p>
        <p className="text-xs text-tinta-suave">{caja === null ? "No disponible" : "Disponible tras pendientes"}</p>
      </Link>
    </div>

    <div className="grid items-start gap-4 xl:grid-cols-2">
    <section className="rounded-2xl bg-sidebar text-white shadow-sm">
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
    </div>
    {porConfirmar.length > 0 && <Link href={urlAgenda(porConfirmar[0].fecha < hoy ? hoy : porConfirmar[0].fecha)} className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950">
      {porConfirmar.length} {porConfirmar.length === 1 ? "operativo" : "operativos"} de {agenda.nombreOptica} por confirmar →
    </Link>}

    <AccesosTrabajo />
  </div>;
}
