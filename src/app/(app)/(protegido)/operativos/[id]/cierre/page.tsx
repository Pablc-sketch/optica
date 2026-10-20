import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { clp } from "@/lib/clp";
import { desglosarCostos, type ItemConCosto } from "@/lib/costo-venta";
import { totalConsultas } from "@/lib/consulta";
import { calcularCierre } from "@/lib/cierre";
import type { BaseComision } from "@/lib/sueldos";
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
  const items = ventas.flatMap((v) => v.venta_items ?? []) as unknown as ItemConCosto[];
  const desglose = desglosarCostos(items);
  const pagos = ventas.flatMap((v) => (v.pagos_abonos ?? []) as { monto: number; medio_pago: string | null }[]);
  const suma = (f: (p: { monto: number; medio_pago: string | null }) => boolean) => pagos.filter(f).reduce((s, p) => s + p.monto, 0);
  const vendido = ventas.reduce((s, v) => s + v.total, 0);
  const cobrado = suma(() => true);
  const gastos = op.costo_transporte + op.costo_arriendo + op.costo_viaticos + op.costo_otros + (op.costo_ayudante ?? 0);

  const c = calcularCierre({
    vendido,
    consultas: totalConsultas(items as unknown as Parameters<typeof totalConsultas>[0]),
    costoCristales: desglose.totalCristales,
    costoMarcos: desglose.totalArmazones,
    gastosOperativo: gastos,
    cobradoDebito: suma((p) => p.medio_pago === "debito"),
    cobradoCredito: suma((p) => p.medio_pago === "credito"),
    pctDebito: Number(tenantRes.data?.comision_debito_pct ?? 0),
    pctCredito: Number(tenantRes.data?.comision_credito_pct ?? 0),
    comisionVendedoraPct: Number(op.comision_vendedora_pct),
    comisionVendedoraBase: op.comision_vendedora_base as BaseComision,
    ahorroPct: Number(op.ahorro_pct),
  });

  const pagadoA = (persona: string) =>
    (retirosRes.data ?? []).filter((r) => r.persona === persona).reduce((s, r) => s + r.monto, 0);
  const fidesPagado = (fidesRes.data ?? []).length > 0;
  const porCobrar = Math.max(0, vendido - cobrado);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/operativos/${id}`} className="text-sm text-tinta-suave underline">
          ← {op.nombre}
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Cerrar operativo</h1>
      </div>

      {error && (
        <p className="rounded-xl bg-red-100 px-4 py-3 text-sm font-semibold text-red-800">
          No se pudieron leer todos los datos. Recarga la página antes de pagar.
        </p>
      )}

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">Ganancia real</p>
        <p className="text-4xl font-bold tracking-tight text-emerald-800 tabular-nums">{clp(c.utilidad)}</p>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-tinta-suave">Ver cómo se calcula</summary>
          <table className="mt-2 w-full text-sm tabular-nums">
            <tbody>
              <tr><td className="py-1">Vendido</td><td className="text-right">{clp(vendido)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Cristales (Fides)</td><td className="text-right">−{clp(desglose.totalCristales)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Marcos ({desglose.marcos} × $5.000)</td><td className="text-right">−{clp(desglose.totalArmazones)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Gastos del operativo (arriendo, equipos, Diego…)</td><td className="text-right">−{clp(gastos)}</td></tr>
              <tr className="text-tinta-suave"><td className="py-1">− Comisión de la máquina</td><td className="text-right">−{clp(c.comisionTarjeta)}</td></tr>
              <tr className="border-t font-bold"><td className="py-1.5">Ganancia</td><td className="text-right">{clp(c.utilidad)}</td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-xs text-tinta-suave">
            Los gastos (arriendo, equipos) se cambian en la ficha del operativo, en &quot;Costos y metas&quot;.
          </p>
        </details>
        {porCobrar > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Todavía falta cobrar <b>{clp(porCobrar)}</b>. El reparto ya lo cuenta: si pagas todo hoy, ese monto sale de tu bolsillo hasta
            que lo cobres.
          </p>
        )}
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
        <p className="text-sm text-tinta-suave">Se queda en la cuenta. El porcentaje se cambia en la ficha del operativo.</p>
      </section>
    </div>
  );
}
