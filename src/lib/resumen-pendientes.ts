import "server-only";
import { createClient } from "./supabase/server";
import { leerTodas } from "./leer-todas";
import { numerosDeOperativo } from "./cierre-operativo";
import { contarLentesYMarcos, type VentaChequeo } from "./chequeos";
import { pagadoCon, pendientesCostos, PREFIJO_FIDES, PREFIJO_MARCOS, pagosConAsignaciones } from "./pagos-operativo";
import { resumirPorPagar, type OperativoPorPagar } from "./por-pagar";

// Incluye históricos y adelantos; los gastos no se presumen pagados por fecha.
export async function cargarPendientes(supabase: Awaited<ReturnType<typeof createClient>>) {
  const [ops, ventas, retiros, gastos, tenant, asignaciones, mesesSii, pagosSii] = await Promise.all([
    leerTodas((a, b) => supabase.from("operativos").select("*").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("ventas").select(`id, operativo_id, total, pagos_abonos (monto, medio_pago),
      venta_items (producto_id, cantidad, precio_unitario, descuento, descripcion, cristal_slot,
        ordenes_trabajo:ot_id (costo_laboratorio, costo_laboratorio_2, tipo_lente, tratamiento, tipo_lente_2, tratamiento_2, marco_propio, marco_propio_2, armazon_producto_id, armazon_producto_id_2),
        productos:producto_id (costo, categoria))`).eq("anulada", false).not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("retiros_sueldo").select("id, operativo_id, chequeo_id, monto").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("gastos_globales").select("id, operativo_id, descripcion, monto").not("operativo_id", "is", null).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct, comision_credito_pct").single(),

    leerTodas((a,b) => supabase.from("gastos_asignaciones").select("id,gasto_id,operativo_id,clave,monto,anulado_en").order("id").range(a,b)),
    leerTodas((a,b) => supabase.from("impuestos_mensuales").select("periodo,total_declarado").order("periodo").range(a,b)),
    leerTodas((a,b) => supabase.from("impuestos_pagos").select("id,periodo,gastos_globales:gasto_id(monto)").is("anulado_en",null).order("id").range(a,b)),
  ]);
  const error = ops.error ?? ventas.error ?? retiros.error ?? gastos.error ?? tenant.error ?? asignaciones.error ?? mesesSii.error ?? pagosSii.error;
  const lista: OperativoPorPagar[] = [];
  if (!error) for (const op of ops.data ?? []) {
    if (op.pagos_saldados_en || op.estado === "cancelado") continue;
    const ventasSede = (ventas.data ?? []).filter(v => v.operativo_id === op.id) as unknown as VentaChequeo[];
    const marcos = ventasSede.reduce((suma, v) => suma + contarLentesYMarcos(v.venta_items ?? []).marcos, 0);
    const n = numerosDeOperativo(op, ventasSede,
      Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0), marcos);
    const pagos = pagosConAsignaciones((gastos.data ?? []).filter((g) => g.operativo_id === op.id), asignaciones.data ?? [], op.id);
    const costos = pendientesCostos(op, pagos);
    lista.push({ operativoId: op.id, nombre: op.nombre, fecha: op.fecha,
      sueldos: { isadora: 0, madre: 0, pablo: 0 },
      fides: n.desglose.totalCristales,
      marcos: n.desglose.totalArmazones,
      gastos: costos.reduce((s, c) => s + Math.max(0, c.total - c.pagado), 0),
      ahorro: 0,
      pagado: { isadora: 0, madre: 0, pablo: 0, ahorro: 0, gastos: 0,
        fides: pagadoCon(pagos, PREFIJO_FIDES), marcos: pagadoCon(pagos, PREFIJO_MARCOS) },
    });
  }
  const impuestosPendientes = (mesesSii.data ?? []).reduce((s,m) => {
    if(m.total_declarado === null) return s;
    const pagado=(pagosSii.data ?? []).filter(p=>p.periodo===m.periodo).reduce((v,p)=>{
      const g=Array.isArray(p.gastos_globales)?p.gastos_globales[0]:p.gastos_globales;
      return v+(g?.monto??0);
    },0);
    return s+Math.max(0,m.total_declarado-pagado);
  },0);
  return { impuestosPendientes, resumen: resumirPorPagar(lista), detalle: lista, error,
    sinAsignar: (retiros.data ?? []).some((r) => !r.operativo_id && !r.chequeo_id && r.monto !== 0) };
}
