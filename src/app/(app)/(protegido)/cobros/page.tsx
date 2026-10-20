import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import TarjetaCobro, { type FilaCobro } from "./tarjeta-cobro";
import RegistrarConsulta from "./registrar-consulta";
import { esConsulta } from "@/lib/consulta";

// Cobros y entregas, separado de la pantalla de vender: se elige el
// operativo y se ve, grande y sin ruido, quién debe, cuánto, y si su lente
// ya está listo. Pensado para el día de la entrega en terreno.
type Vista = "pendientes" | "deben" | "listos" | "todos";

export default async function Cobros({ searchParams }: { searchParams: Promise<{ op?: string; ver?: string }> }) {
  const { op, ver } = await searchParams;
  const vista: Vista = ver === "deben" || ver === "listos" || ver === "todos" ? ver : "pendientes";
  const supabase = await createClient();

  const [operativosRes, tenantRes] = await Promise.all([
    supabase.from("operativos").select("id, nombre, fecha").order("fecha", { ascending: false }).limit(30),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
  ]);
  const pctDebito = Number(tenantRes.data?.comision_debito_pct ?? 0);
  const pctCredito = Number(tenantRes.data?.comision_credito_pct ?? 0);
  const operativos = operativosRes.data ?? [];
  // "sin" = ventas particulares, sin operativo.
  const elegido = op ?? operativos[0]?.id ?? "sin";

  let consulta = supabase
    .from("ventas")
    .select(
      `id, total, fecha, pacientes:paciente_id (nombre, telefono), pagos_abonos (monto, medio_pago),
       venta_items (descripcion, ot_id, ordenes_trabajo:ot_id (id, estado, tipo_lente, tipo_lente_2))`
    )
    .eq("anulada", false)
    .order("fecha", { ascending: false })
    .limit(3000);
  // "todos" = sin filtrar por operativo (lo usan los indicadores globales
  // del Inicio, para que una deuda de otro operativo no quede escondida).
  if (elegido === "sin") consulta = consulta.is("operativo_id", null);
  else if (elegido !== "todos") consulta = consulta.eq("operativo_id", elegido);
  const ventasRes = await consulta;

  type Ot = { id: string; estado: string; tipo_lente: string | null; tipo_lente_2: string | null };
  const todas = ventasRes.data ?? [];
  // Una venta de solo consultas no es una persona a quien cobrarle lentes.
  const soloConsulta = (v: (typeof todas)[number]) =>
    (v.venta_items ?? []).length > 0 && (v.venta_items ?? []).every((i) => esConsulta((i as { descripcion: string | null }).descripcion));

  // Caja del operativo: lo cobrado por medio de pago (lentes y consultas) y
  // lo que la máquina se queda de comisión, para comparar con Mercado Pago.
  const pagos = todas.flatMap((v) => (v.pagos_abonos ?? []) as { monto: number; medio_pago: string | null }[]);
  const porMedio = (m: string) => pagos.filter((p) => p.medio_pago === m).reduce((s, p) => s + p.monto, 0);
  const debito = porMedio("debito");
  const credito = porMedio("credito");
  const transferencia = porMedio("transferencia");
  const efectivo = pagos.filter((p) => !p.medio_pago || p.medio_pago === "efectivo").reduce((s, p) => s + p.monto, 0);
  const comision = Math.round((debito * pctDebito + credito * pctCredito) / 100);
  const consultas = todas.filter(soloConsulta).reduce((s, v) => s + v.total, 0);

  const filas: FilaCobro[] = todas.filter((v) => !soloConsulta(v)).map((v) => {
    const pacRaw = v.pacientes as unknown as { nombre: string; telefono: string | null } | { nombre: string; telefono: string | null }[] | null;
    const paciente = Array.isArray(pacRaw) ? pacRaw[0] : pacRaw;
    const pagado = (v.pagos_abonos ?? []).reduce((s: number, p: { monto: number }) => s + p.monto, 0);
    const ots = new Map<string, Ot>();
    for (const item of v.venta_items ?? []) {
      const rel = (item as { ordenes_trabajo?: Ot | Ot[] | null }).ordenes_trabajo;
      const ot = Array.isArray(rel) ? rel[0] : rel;
      if (ot) ots.set(ot.id, ot);
    }
    const pares = (o: Ot) => (o.tipo_lente ? 1 : 0) + (o.tipo_lente_2 ? 1 : 0) || 1;
    const sumar = (f: (o: Ot) => boolean) => [...ots.values()].filter(f).reduce((s, o) => s + pares(o), 0);
    return {
      ventaId: v.id,
      nombre: paciente?.nombre ?? "Sin paciente",
      telefono: paciente?.telefono ?? null,
      total: v.total,
      pagado,
      saldo: Math.max(0, v.total - pagado),
      listos: sumar((o) => o.estado === "listo"),
      enProceso: sumar((o) => !["listo", "entregado", "cancelado"].includes(o.estado)),
      entregados: sumar((o) => o.estado === "entregado"),
    };
  });

  const visibles = filas
    .filter((f) =>
      vista === "deben"
        ? f.saldo > 0
        : vista === "listos"
          ? f.listos > 0
          : vista === "todos"
            ? true
            : f.saldo > 0 || f.listos > 0
    )
    // Primero los que tienen el lente listo y deben: son los que se
    // atienden en la entrega. Después el resto, por monto.
    .sort((a, b) => Number(b.listos > 0) - Number(a.listos > 0) || b.saldo - a.saldo);

  const porCobrar = filas.reduce((s, f) => s + f.saldo, 0);
  const deudores = filas.filter((f) => f.saldo > 0).length;
  const listos = filas.filter((f) => f.listos > 0).length;

  const enlace = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ op: elegido, ...(vista !== "pendientes" ? { ver: vista } : {}), ...extra });
    return `/cobros?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Cobros y entregas</h1>
          <p className="text-sm text-tinta-suave">Elige el operativo: ves quién debe y quién tiene su lente listo.</p>
        </div>
        <Link href="/ventas" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          ＋ Nueva venta
        </Link>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {operativos.map((o) => (
          <Link
            key={o.id}
            href={`/cobros?op=${o.id}`}
            className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold ${
              o.id === elegido ? "border-tinta bg-tinta text-white" : "border-tinta/15 bg-white hover:bg-crema"
            }`}
          >
            {o.nombre}
          </Link>
        ))}
        <Link
          href="/cobros?op=todos"
          className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold ${
            elegido === "todos" ? "border-tinta bg-tinta text-white" : "border-tinta/15 bg-white hover:bg-crema"
          }`}
        >
          Todos
        </Link>
        <Link
          href="/cobros?op=sin"
          className={`whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-semibold ${
            elegido === "sin" ? "border-tinta bg-tinta text-white" : "border-tinta/15 bg-white hover:bg-crema"
          }`}
        >
          Sin operativo
        </Link>
      </div>

      {ventasRes.error ? (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          No se pudieron leer las ventas ({ventasRes.error.message}). Recarga la página; no es que no haya nadie.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Por cobrar</p>
              <p className="text-3xl font-bold text-red-700 tabular-nums">{clp(porCobrar)}</p>
              <p className="text-xs text-tinta-suave">
                {deudores} {deudores === 1 ? "persona" : "personas"}
              </p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Listos para entregar</p>
              <p className="text-3xl font-bold text-emerald-700 tabular-nums">{listos}</p>
              <p className="text-xs text-tinta-suave">{listos === 1 ? "persona" : "personas"}</p>
            </div>
          </div>

          <details className="rounded-2xl bg-white p-4 shadow-sm">
            <summary className="cursor-pointer">
              <span className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">
                {elegido === "todos" ? "Caja de todos los operativos · " : elegido === "sin" ? "Caja sin operativo · " : "Caja del operativo · "}
              </span>
              <span className="font-semibold">llega a la cuenta {clp(debito + credito + transferencia - comision)}</span>
              <span className="text-sm text-tinta-suave"> · efectivo {clp(efectivo)}</span>
            </summary>
            <table className="mt-3 w-full text-sm tabular-nums">
              <tbody>
                <tr><td className="py-1">Débito</td><td className="text-right">{clp(debito)}</td></tr>
                <tr><td className="py-1">Crédito</td><td className="text-right">{clp(credito)}</td></tr>
                <tr><td className="py-1">Transferencia</td><td className="text-right">{clp(transferencia)}</td></tr>
                <tr className="text-red-700">
                  <td className="py-1">Comisión de la máquina ({pctDebito}% débito · {pctCredito}% crédito)</td>
                  <td className="text-right">−{clp(comision)}</td>
                </tr>
                <tr className="border-t font-bold">
                  <td className="py-1.5">Llega a la cuenta (Mercado Pago)</td>
                  <td className="text-right">{clp(debito + credito + transferencia - comision)}</td>
                </tr>
                <tr><td className="py-1">Efectivo (en la mano)</td><td className="text-right">{clp(efectivo)}</td></tr>
                <tr className="text-tinta-suave"><td className="py-1">De eso, consultas</td><td className="text-right">{clp(consultas)}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-tinta-suave">
              La comisión es aproximada (Mercado Pago redondea cada cobro). Las tasas se cambian en Reportes.
            </p>
          </details>

          {elegido !== "todos" && <RegistrarConsulta operativoId={elegido === "sin" ? null : elegido} />}
          {elegido !== "sin" && elegido !== "todos" && (
            <Link
              href={`/operativos/${elegido}/cierre`}
              className="rounded-xl bg-emerald-800 px-4 py-3 text-center text-base font-semibold text-white hover:bg-emerald-900"
            >
              💵 Cerrar operativo y pagar a cada uno
            </Link>
          )}

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { valor: "pendientes", titulo: "Pendientes" },
                { valor: "deben", titulo: "Deben" },
                { valor: "listos", titulo: "Lente listo" },
                { valor: "todos", titulo: "Todos" },
              ] as const
            ).map((t) => (
              <Link
                key={t.valor}
                href={enlace({ ver: t.valor })}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold ${
                  vista === t.valor ? "bg-brand text-white" : "bg-white text-tinta shadow-sm hover:bg-crema"
                }`}
              >
                {t.titulo}
              </Link>
            ))}
          </div>

          {visibles.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm text-tinta-suave shadow-sm">
              Nadie en esta lista. 🎉
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {visibles.map((f) => (
                <TarjetaCobro key={f.ventaId} fila={f} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
