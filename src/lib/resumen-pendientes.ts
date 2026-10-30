import "server-only";
import { createClient } from "./supabase/server";
import { leerTodas } from "./leer-todas";
import { numerosDeOperativo, type VentaParaCierre } from "./cierre-operativo";
import { pagadoCon, pendientesCostos, PREFIJO_FIDES, PREFIJO_MARCOS } from "./pagos-operativo";
import { resumirPorPagar, type OperativoPorPagar } from "./por-pagar";

// Incluye históricos y adelantos; los gastos no se presumen pagados por fecha.
export async function cargarPendientes(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [ops, ventas, retiros, gastos, tenant] = await Promise.all([
    leerTodas((a, b) => supabase.from("operativos").select("*").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("ventas").select(`id, operativo_id, total, pagos_abonos (monto, medio_pago),
      venta_items (cantidad, precio_unitario, descuento, descripcion, cristal_slot,
        ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2),
        productos:producto_id (costo, categoria))`).eq("anulada", false).not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("retiros_sueldo").select("id, operativo_id, persona, monto").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("gastos_globales").select("id, operativo_id, descripcion, monto").not("operativo_id", "is", null).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),
  ]);
  const error = ops.error ?? ventas.error ?? retiros.error ?? gastos.error ?? tenant.error;
  const lista: OperativoPorPagar[] = [];
  if (!error) for (const op of ops.data ?? []) {
    const n = numerosDeOperativo(op, (ventas.data ?? []).filter((v) => v.operativo_id === op.id) as unknown as VentaParaCierre[],
      Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0));
    const pagos = (gastos.data ?? []).filter((g) => g.operativo_id === op.id);
    const costos = pendientesCostos(op, pagos);
    const pagadoA = (persona: string) => (retiros.data ?? []).filter((r) => r.operativo_id === op.id && r.persona === persona).reduce((s, r) => s + r.monto, 0);
    lista.push({ operativoId: op.id, nombre: op.nombre, fecha: op.fecha,
      sueldos: { isadora: n.cierre.isadora, madre: n.cierre.madre, pablo: n.cierre.pablo },
      fides: n.desglose.totalCristales,
      marcos: n.desglose.totalArmazones,
      gastos: costos.reduce((s, c) => s + Math.max(0, c.total - c.pagado), 0),
      ahorro: n.cierre.ahorro,
      pagado: { isadora: pagadoA("isadora"), madre: pagadoA("madre"), pablo: pagadoA("pablo"), ahorro: pagadoA("ahorro"), gastos: 0,
        fides: pagadoCon(pagos, PREFIJO_FIDES), marcos: pagadoCon(pagos, PREFIJO_MARCOS) },
    });
  }
  return { resumen: resumirPorPagar(lista), error,
    sinAsignar: (retiros.data ?? []).some((r) => !r.operativo_id && r.monto !== 0) };
}
