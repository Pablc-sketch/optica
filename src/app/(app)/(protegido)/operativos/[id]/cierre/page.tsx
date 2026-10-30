import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { clp } from "@/lib/clp";
import { numerosDeOperativo, type VentaParaCierre } from "@/lib/cierre-operativo";
import FilaPago from "./fila-pago";

// Cerrar el operativo: cuánto se ganó de verdad y a quién hay que pagarle.
// Cada "Marcar pagado" saca esa plata de la caja, así la cuenta de la app
// muestra lo mismo que la cuenta real después de repartir.
export default async function CierreOperativo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await exigirRolPagina(["admin"]);

  const [opRes, ventasRes, tenantRes, retirosRes, fidesRes] = await Promise.all([
    supabase.from("operativos").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("ventas")
      .select(
        `total, pagos_abonos (monto, medio_pago),
         venta_items (cantidad, precio_unitario, descuento, descripcion, cristal_slot,
           ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
           productos:producto_id (costo, categoria))`
      )
      .eq("operativo_id", id)
      .eq("anulada", false),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
    supabase.from("retiros_sueldo").select("persona, monto").eq("operativo_id", id),
    supabase.from("gastos_globales").select("monto").eq("operativo_id", id).like("descripcion", "Fides%"),
  ]);
  const op = opRes.data;
  if (!op) notFound();
  const error = ventasRes.error ?? retirosRes.error ?? fidesRes.error;

  const ventas = ventasRes.data ?? [];
  const n = numerosDeOperativo(
    op,
    ventas as unknown as VentaParaCierre[],
    Number(tenantRes.data?.comision_debito_pct ?? 0),
    Number(tenantRes.data?.comision_credito_pct ?? 0)
  );
  const { vendido, cobrado, gastos, desglose, cierre: c } = n;

  const pagadoA = (persona: string) =>
    (retirosRes.data ?? []).filter((r) => r.persona === persona).reduce((s, r) => s + r.monto, 0);
  const fidesPagado = (fidesRes.data ?? []).length > 0;
  const porCobrar = n.porCobrar;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/operativos/${id}`} className="text-sm text-tinta-suave underline">
          ← {op.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Reparto y pagos del operativo</h1>
        <Link
          href={`/cobros?op=${id}&ver=deben`}
          className="mt-2 inline-block rounded-xl border-2 border-tinta/15 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-crema"
        >
          Quién debe →
        </Link>
      </div>

      {error && (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          No se pudieron leer todos los datos. Recarga la página antes de pagar.
        </p>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">
          {porCobrar > 0 ? "Ganancia estimada (falta cobrar)" : "Ganancia real"}
        </p>
        <p className="text-4xl font-bold tracking-tight text-emerald-800 tabular-nums">{clp(c.utilidad)}</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-sm tabular-nums">
          <div>
            <p className="text-xs text-tinta-suave">Vendido</p>
            <p className="font-bold">{clp(vendido)}</p>
          </div>
          <div>
            <p className="text-xs text-tinta-suave">Cobrado</p>
            <p className="font-bold text-emerald-800">{clp(cobrado)}</p>
          </div>
          <div>
            <p className="text-xs text-tinta-suave">Falta cobrar</p>
            <p className={`font-bold ${porCobrar > 0 ? "text-red-700" : ""}`}>{clp(porCobrar)}</p>
          </div>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-tinta-suave">Ver cómo se calcula</summary>
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody>
              <tr><td className="py-1">Vendido</td><td className="text-right">{clp(vendido)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Cristales (Fides)</td><td className="text-right">−{clp(desglose.totalCristales)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Marcos ({desglose.marcos} × $5.000)</td><td className="text-right">−{clp(desglose.totalArmazones)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Gastos (equipos, arriendo, Diego…)</td><td className="text-right">−{clp(gastos)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Comisión de la máquina</td><td className="text-right">−{clp(c.comisionTarjeta)}</td></tr>
              <tr className="border-t font-bold"><td className="py-1.5">{porCobrar > 0 ? "Ganancia estimada" : "Ganancia"}</td><td className="text-right">{clp(c.utilidad)}</td></tr>
            </tbody>
          </table>
        </details>
      </section>

      <h2 className="text-lg font-bold">A pagar</h2>
      <ul className="flex flex-col gap-3">
        <FilaPago tipo="fides" operativoId={id} nombreOperativo={op.nombre} monto={desglose.totalCristales} pagado={fidesPagado} />
        <FilaPago tipo="ayudante" operativoId={id} monto={op.costo_ayudante ?? 0} />
        <FilaPago tipo="sueldo" operativoId={id} persona="isadora" nombre="Isadora" monto={c.isadora} pagado={pagadoA("isadora")} />
        <FilaPago tipo="sueldo" operativoId={id} persona="madre" nombre="Mamá" monto={c.madre} pagado={pagadoA("madre")} />
        <FilaPago tipo="sueldo" operativoId={id} persona="pablo" nombre="Pablo" monto={c.pablo} pagado={pagadoA("pablo")} />
      </ul>

      <section className="rounded-2xl bg-crema p-4">
        <p className="text-sm font-semibold">Ahorro del negocio ({Number(op.ahorro_pct)}%)</p>
        <p className="text-2xl font-bold tabular-nums">{clp(c.ahorro)}</p>
      </section>
    </div>
  );
}
