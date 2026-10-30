import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, hoyEnChile, inicioDelDia } from "@/lib/fechas";
import { resumirCaja } from "@/lib/caja";
import { cargarPendientes } from "@/lib/resumen-pendientes";
import CajaMovimientos from "@/components/caja-movimientos";
import { leerTodas } from "@/lib/leer-todas";


const BOTONES = [
  { href: "/ventas", titulo: "Vender", icono: "🛒", clase: "bg-brand text-white" },
  { href: "/cobros", titulo: "Cobrar", icono: "💵", clase: "bg-emerald-800 text-white" },
  { href: "/entregas", titulo: "Entrega", icono: "📦", clase: "bg-sky-800 text-white" },
  { href: "/pacientes", titulo: "Paciente / receta", icono: "👁️", clase: "bg-tinta text-white" },
  { href: "/avisos", titulo: "Avisar", icono: "💬", clase: "bg-white text-tinta" },
  { href: "/operativos", titulo: "Operativos", icono: "📍", clase: "bg-white text-tinta" },
];

export default async function Dashboard() {
  const supabase = await createClient();

  // El rol "ventas" (vendedoras de mesón) solo necesita órdenes y ventas —
  // este panel muestra cifras de negocio que no le corresponden.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfil?.rol === "ventas") redirect("/ventas");
  if (perfil?.rol === "clinico") redirect("/pacientes");
  if (perfil?.rol === "bodega") redirect("/ot");
  if (perfil?.rol !== "admin") redirect("/login");

  const hoy = hoyEnChile();
  const [ventasHoy, proximoOperativo, pendientesRes, tenantRes, cajaRes, ventasSaldoRes, listosRes] = await Promise.all([
    leerTodas((a, b) => supabase.from("ventas").select("id, total").eq("anulada", false).gte("fecha", inicioDelDia(hoy)).order("id").range(a, b)),
    supabase
      .from("operativos")
      .select("id, nombre, fecha")
      .eq("estado", "planificado")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    cargarPendientes(supabase),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
    supabase.rpc("caja_global").single(),
    leerTodas((a, b) => supabase.from("ventas").select("id, total, pagos_abonos (monto)").eq("anulada", false).order("id").range(a, b)),
    supabase.from("ordenes_trabajo").select("id", { count: "exact", head: true }).eq("estado", "listo"),
  ]);

  const pctDebito = Number(tenantRes.data?.comision_debito_pct ?? 0);
  const pctCredito = Number(tenantRes.data?.comision_credito_pct ?? 0);
  const lecturaOk = !pendientesRes.error && !tenantRes.error;
  const porPagar = pendientesRes.resumen;

  // Caja: lo que hay hoy en la mano y en la cuenta (la misma cuenta de Reportes).
  const t = cajaRes.data as {
    entro_efectivo: number;
    entro_digital: number;
    entro_debito: number;
    entro_credito: number;
    salio_efectivo: number;
    salio_digital: number;
    gastos_operativo: number;
  } | null;
  const caja = resumirCaja(
    {
      entroEfectivo: t?.entro_efectivo ?? 0,
      entroDigital: t?.entro_digital ?? 0,
      entroDebito: t?.entro_debito ?? 0,
      entroCredito: t?.entro_credito ?? 0,
      salioEfectivo: t?.salio_efectivo ?? 0,
      salioDigital: t?.salio_digital ?? 0,
    },
    { comisionDebitoPct: pctDebito, comisionCreditoPct: pctCredito }
  );
  const queda = caja.total - porPagar.total - porPagar.ahorro;

  const totalHoy = (ventasHoy.data ?? []).reduce((s, v) => s + v.total, 0);
  const porCobrar = (ventasSaldoRes.data ?? []).reduce(
    (s, v) => s + Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((a: number, p: { monto: number }) => a + p.monto, 0)),
    0
  );
  const listos = listosRes.count ?? 0;
  const proximo = proximoOperativo.data;


  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Hola</h1>
        <p className="text-sm text-tinta-suave">
          Hoy <b className="text-tinta">{ventasHoy.error ? "No disponible" : clp(totalHoy)}</b>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {BOTONES.map((b) => (
          <Link key={b.href} href={b.href} className={`flex flex-col gap-1 rounded-2xl p-4 shadow-sm ${b.clase}`}>
            <span className="text-2xl" aria-hidden>
              {b.icono}
            </span>
            <span className="text-base font-bold">{b.titulo}</span>
          </Link>
        ))}
      </div>

      {(listos > 0 || porCobrar > 0 || listosRes.error || ventasSaldoRes.error) && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/entregas" className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Listos para entregar</p>
            <p className="text-3xl font-bold tabular-nums text-emerald-700">{listosRes.error ? "No disponible" : listos}</p>
          </Link>
          <Link href="/cobros?op=todos&ver=deben" className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Te deben</p>
            <p className="text-3xl font-bold tabular-nums text-red-700">{ventasSaldoRes.error ? "No disponible" : clp(porCobrar)}</p>
          </Link>
        </div>
      )}

      <details className="rounded-2xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4">
        <span className="mb-2 block text-lg font-bold">Caja <span className="float-right text-sm font-medium text-sky-800">Ver detalle ▾</span></span>
        {cajaRes.error || !lecturaOk ? (
          <span className="block text-sm font-semibold text-red-700">No se pudo leer la caja. Recarga la página.</span>
        ) : (
          <>
            <span className="block text-xs font-semibold uppercase tracking-wider text-tinta-suave">Disponible tras pagos y ahorro</span>
            <span className={`block text-4xl font-bold tabular-nums ${queda < 0 ? "text-red-700" : "text-emerald-800"}`}>{clp(queda)}</span>
            <span className="block mt-1 text-sm tabular-nums text-tinta-suave">
              Caja registrada {clp(caja.total)} · Cuenta {clp(caja.hayDigital)} · Efectivo {clp(caja.hayEfectivo)}
              {porPagar.total > 0 && <> · Por pagar −{clp(porPagar.total)}</>}
              {porPagar.ahorro > 0 && <> · Ahorro por separar −{clp(porPagar.ahorro)}</>}
            </span>
          </>
        )}
        </summary>
        {!cajaRes.error && lecturaOk && <>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-tinta/10 pt-3 text-sm">
            <div><h3 className="font-bold">Efectivo</h3><p>Entradas {clp(caja.entroEfectivo)}</p><p>Salidas {clp(caja.salioEfectivo)}</p><p className="font-bold">Saldo {clp(caja.hayEfectivo)}</p></div>
            <div><h3 className="font-bold">Cuenta registrada</h3><p>Entradas {clp(caja.entroDigital)}</p><p>Salidas {clp(caja.salioDigital)}</p><p>Comisiones estimadas {clp(caja.comisionTarjeta)}</p><p className="font-bold">Saldo {clp(caja.hayDigital)}</p></div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/pagos?ver=costos" className="rounded-xl border px-3 py-2 text-sm">Por pagar {clp(porPagar.total)}</Link>
            <Link href="/pagos?ver=ahorro" className="rounded-xl border px-3 py-2 text-sm">Ahorro por separar {clp(porPagar.ahorro)}</Link>
            <Link href="/configuracion/integraciones" className="rounded-xl bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">Cuentas y boletas →</Link>
          </div>
          <p className="mt-3 text-xs text-tinta-suave">Calculado con movimientos de Lentia; no es un saldo bancario sincronizado.</p>
          <CajaMovimientos />
        </>}
      </details>

      {pendientesRes.sinAsignar && <Link href="/reportes" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Revisar retiros sin operativo antes de repartir →</Link>}
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Por pagar</h2>
        {!lecturaOk ? <p className="text-sm text-red-700">Pendientes no disponibles. Recarga.</p> : porPagar.total === 0 && porPagar.ahorro === 0 ? (
          <p className="rounded-2xl bg-emerald-50 p-4 text-center font-semibold text-emerald-800">Todo pagado ✓</p>
        ) : (
          <>
            {porPagar.costos > 0 && (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="bg-crema text-left text-xs uppercase tracking-wider text-tinta-suave">
                      <th className="px-3 py-2">Operativo</th>
                      <th className="px-2 py-2 text-right">Fides</th>
                      <th className="px-2 py-2 text-right">Marcos</th>
                      <th className="px-3 py-2 text-right">Gastos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {porPagar.operativos.filter((p) => p.costos > 0).map((p) => (
                      <tr key={p.operativoId} className="border-t border-tinta/10">
                        <td className="px-3 py-2">
                          <Link href={`/operativos/${p.operativoId}/cierre#costos`} className="font-semibold underline-offset-2 hover:underline">{p.nombre}</Link>
                        </td>
                        <td className="px-2 py-2 text-right">{p.fides ? clp(p.fides) : "—"}</td>
                        <td className="px-2 py-2 text-right">{p.marcos ? clp(p.marcos) : "—"}</td>
                        <td className="px-3 py-2 text-right">{p.gastos ? clp(p.gastos) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-tinta/20 font-bold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-2 py-2 text-right">{clp(porPagar.fides)}</td>
                      <td className="px-2 py-2 text-right">{clp(porPagar.marcos)}</td>
                      <td className="px-3 py-2 text-right">{clp(porPagar.gastos)}</td>
                    </tr>
                  </tfoot>
                </table>
                <p className="flex justify-between border-t border-tinta/10 bg-crema px-3 py-2.5 text-base font-bold">
                  <span>Costos por pagar</span>
                  <span className="tabular-nums">{clp(porPagar.costos)}</span>
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {porPagar.sueldos > 0 && (
                <Link href="/pagos?ver=sueldos" className="rounded-2xl bg-white p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Sueldos</p>
                  <p className="text-xl font-bold tabular-nums">{clp(porPagar.sueldos)}</p>
                </Link>
              )}
              {porPagar.ahorro > 0 && (
                <Link href="/pagos?ver=ahorro" className="rounded-2xl bg-emerald-50 p-3 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Ahorro</p>
                  <p className="text-xl font-bold tabular-nums">{clp(porPagar.ahorro)}</p>
                </Link>
              )}
            </div>
          </>
        )}
      </section>

      {proximo && (
        <Link href={`/operativos/${proximo.id}`} className="rounded-2xl bg-sky-50 p-4 shadow-sm">
          <span className="text-xs font-semibold uppercase tracking-wider text-sky-800">Próximo operativo</span>
          <span className="block text-lg font-bold text-sky-950">{proximo.nombre}</span>
          <span className="text-sm text-sky-800">{fechaLegible(proximo.fecha)}</span>
        </Link>
      )}
    </div>
  );
}
