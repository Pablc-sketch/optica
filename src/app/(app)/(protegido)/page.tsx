import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, hoyEnChile, inicioDelDia } from "@/lib/fechas";
import { resumirCaja } from "@/lib/caja";
import { numerosDeOperativo, type VentaParaCierre } from "@/lib/cierre-operativo";
import { resumirPorPagar, type OperativoPorPagar } from "@/lib/por-pagar";

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
  const { data: perfil } = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfil?.rol === "ventas") redirect("/ventas");

  const hoy = hoyEnChile();
  const [ventasHoy, proximoOperativo, operativosRes, tenantRes, cajaRes, ventasSaldoRes, listosRes] = await Promise.all([
    supabase.from("ventas").select("total").eq("anulada", false).gte("fecha", inicioDelDia(hoy)),
    supabase
      .from("operativos")
      .select("id, nombre, fecha")
      .eq("estado", "planificado")
      .gte("fecha", hoy)
      .order("fecha", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("operativos")
      .select(
        "id, nombre, fecha, comision_vendedora_pct, comision_vendedora_base, ahorro_pct, costo_transporte, costo_arriendo, costo_viaticos, costo_otros, costo_ayudante, costo_equipos"
      )
      .lte("fecha", hoy)
      .neq("estado", "cancelado")
      .order("fecha", { ascending: false })
      .limit(12),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
    supabase.rpc("caja_global").single(),
    supabase.from("ventas").select("total, pagos_abonos (monto)").eq("anulada", false).limit(3000),
    supabase.from("ordenes_trabajo").select("id", { count: "exact", head: true }).eq("estado", "listo"),
  ]);

  const operativos = operativosRes.data ?? [];
  const ids = operativos.map((o) => o.id);
  const [ventasOpRes, retirosRes, fidesRes] = ids.length
    ? await Promise.all([
        supabase
          .from("ventas")
          .select(
            `operativo_id, total, pagos_abonos (monto, medio_pago),
             venta_items (cantidad, precio_unitario, descuento, descripcion, cristal_slot,
               ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
               productos:producto_id (costo, categoria))`
          )
          .in("operativo_id", ids)
          .eq("anulada", false),
        supabase.from("retiros_sueldo").select("operativo_id, persona, monto").eq("es_sueldo", true).in("operativo_id", ids),
        supabase.from("gastos_globales").select("operativo_id").like("descripcion", "Fides%").in("operativo_id", ids),
      ])
    : [null, null, null];

  const pctDebito = Number(tenantRes.data?.comision_debito_pct ?? 0);
  const pctCredito = Number(tenantRes.data?.comision_credito_pct ?? 0);

  // Lo que falta pagar de cada operativo (sueldos y Fides). Lo ya pagado no aparece.
  const lecturaOk = !ventasOpRes?.error && !retirosRes?.error && !fidesRes?.error;
  const porPagarLista: OperativoPorPagar[] = [];
  for (const o of operativos) {
    const ventas = (ventasOpRes?.data ?? []).filter((v) => v.operativo_id === o.id) as unknown as VentaParaCierre[];
    const n = numerosDeOperativo(o, ventas, pctDebito, pctCredito);
    if (n.vendido === 0) continue;
    const pagadoA = (persona: string) =>
      (retirosRes?.data ?? []).filter((r) => r.operativo_id === o.id && r.persona === persona).reduce((s, r) => s + r.monto, 0);
    porPagarLista.push({
      operativoId: o.id,
      nombre: o.nombre,
      fecha: o.fecha,
      sueldos: { isadora: n.cierre.isadora, madre: n.cierre.madre, pablo: n.cierre.pablo },
      fides: n.desglose.totalCristales,
      ahorro: n.cierre.ahorro,
      pagado: {
        isadora: pagadoA("isadora"),
        madre: pagadoA("madre"),
        pablo: pagadoA("pablo"),
        fides: (fidesRes?.data ?? []).some((g) => g.operativo_id === o.id),
      },
    });
  }
  const porPagar = resumirPorPagar(porPagarLista);

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
      salioDigital: (t?.salio_digital ?? 0) + (t?.gastos_operativo ?? 0),
    },
    { comisionDebitoPct: pctDebito, comisionCreditoPct: pctCredito }
  );
  const queda = caja.total - porPagar.total;

  const totalHoy = (ventasHoy.data ?? []).reduce((s, v) => s + v.total, 0);
  const porCobrar = (ventasSaldoRes.data ?? []).reduce(
    (s, v) => s + Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((a: number, p: { monto: number }) => a + p.monto, 0)),
    0
  );
  const listos = listosRes.count ?? 0;
  const proximo = proximoOperativo.data;
  const primero = porPagar.operativos[0];

  const caja3 = [
    { titulo: "Sueldos", valor: porPagar.sueldos, clase: "bg-white" },
    { titulo: "Ahorro", valor: porPagar.ahorro, clase: "bg-emerald-50" },
    { titulo: "Costos", valor: porPagar.costos, clase: "bg-white" },
  ].filter((c) => c.valor > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Hola</h1>
        <p className="text-sm text-tinta-suave">
          Hoy <b className="text-tinta">{clp(totalHoy)}</b>
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

      {(listos > 0 || porCobrar > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <Link href="/entregas" className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Listos para entregar</p>
            <p className="text-3xl font-bold tabular-nums text-emerald-700">{listos}</p>
          </Link>
          <Link href="/cobros?op=todos&ver=deben" className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Te deben</p>
            <p className="text-3xl font-bold tabular-nums text-red-700">{clp(porCobrar)}</p>
          </Link>
        </div>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        {cajaRes.error || !lecturaOk ? (
          <p className="text-sm font-semibold text-red-700">No se pudo leer la caja. Recarga la página.</p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Caja · lo que queda después de pagar</p>
            <p className={`text-4xl font-bold tabular-nums ${queda < 0 ? "text-red-700" : "text-emerald-800"}`}>{clp(queda)}</p>
            <p className="mt-1 text-sm tabular-nums text-tinta-suave">
              Cuenta {clp(caja.hayDigital)} · Efectivo {clp(caja.hayEfectivo)}
              {porPagar.total > 0 && <> · Por pagar −{clp(porPagar.total)}</>}
            </p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-bold">Por pagar</h2>
        {caja3.length === 0 ? (
          <p className="rounded-2xl bg-emerald-50 p-4 text-center font-semibold text-emerald-800">Todo pagado ✓</p>
        ) : (
          <>
            <div className={`grid gap-3 ${caja3.length === 1 ? "grid-cols-1" : caja3.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {caja3.map((c) => (
                <Link
                  key={c.titulo}
                  href={primero ? `/operativos/${primero.operativoId}/cierre` : "/operativos"}
                  className={`rounded-2xl p-3 shadow-sm ${c.clase}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">{c.titulo}</p>
                  <p className="text-xl font-bold tabular-nums">{clp(c.valor)}</p>
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {porPagar.operativos.map((p) => (
                <Link
                  key={p.operativoId}
                  href={`/operativos/${p.operativoId}/cierre`}
                  className="rounded-full border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema"
                >
                  {p.nombre} · {clp(p.total)}
                </Link>
              ))}
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
