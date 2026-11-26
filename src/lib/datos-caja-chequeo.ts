import "server-only";
import type { createClient } from "./supabase/server";
import { gastoDeResultado, resumirCajaChequeo } from "./caja-chequeo";
import { resumirChequeo, type AtencionChequeo, type Chequeo, type SedeChequeo, type VentaChequeo } from "./chequeos";
import { inicioDelDia } from "./fechas";
import { impuestoDeMes, type MesImpuesto } from "./impuestos";
import { leerTodas } from "./leer-todas";
import { disponibleDeGasto } from "./pagos-operativo";

const columnasGasto = "id,fecha,descripcion,monto,caja,categoria,operativo_id,chequeo_id,nota,monto_estimado";
const columnasAsignacion = "id,gasto_id,operativo_id,clave,monto,anulado_en";

function lotesDe(ids: string[]) {
  const lotes = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
  return lotes;
}

export async function cargarCajaChequeo(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string,
  chequeo: Chequeo, integrantes: SedeChequeo[],
) {
  const lotes = lotesDe(integrantes.map(s => s.id));
  const [datos, gastos, tenant] = await Promise.all([
    Promise.all(lotes.map(lote => Promise.all([
      leerTodas((a, b) => supabase.from("recetas").select("id,operativo_id,paciente_id").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("ventas").select(
        `id,operativo_id,total,pagos_abonos(monto,medio_pago),
         venta_items(producto_id,cantidad,precio_unitario,descripcion,descuento,cristal_slot,
           ordenes_trabajo:ot_id(estado,costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2,marco_propio,marco_propio_2,armazon_producto_id,armazon_producto_id_2),
           productos:producto_id(costo,categoria))`
      ).eq("tenant_id", tenantId).eq("anulada", false).in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_globales").select(columnasGasto).eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_asignaciones").select(columnasAsignacion).eq("tenant_id", tenantId)
        .in("operativo_id", lote).is("anulado_en", null).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("retiros_sueldo").select("id,persona,monto").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
    ]))),
    leerTodas((a, b) => supabase.from("gastos_globales").select(columnasGasto).eq("tenant_id", tenantId)
      .eq("chequeo_id", chequeo.id).order("fecha", { ascending: false }).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct,comision_credito_pct,reparto_etiquetas").eq("id", tenantId).single(),
  ]);
  const compartidos = gastos.data ?? [];
  const directos = datos.flatMap(([, , g]) => g.data ?? []);
  const asignacionesLocales = datos.flatMap(([, , , a]) => a.data ?? []);
  const retiros = datos.flatMap(([, , , , r]) => r.data ?? []);
  const propios = [...new Map([...compartidos, ...directos].map(g => [g.id, g])).values()];
  const idsPropios = new Set(propios.map(g => g.id));
  const externos = [...new Set(asignacionesLocales.map(a => a.gasto_id).filter(id => !idsPropios.has(id)))];
  const lotesGasto = lotesDe([...idsPropios, ...externos]);
  const [asignaciones, devoluciones, gastosExternos] = await Promise.all([
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("gastos_asignaciones")
      .select(columnasAsignacion).eq("tenant_id", tenantId).in("gasto_id", lote).is("anulado_en", null).order("id").range(a, b)))),
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("caja_movimientos")
      .select("id,gasto_id,monto").eq("tenant_id", tenantId).eq("tipo", "devolucion").in("gasto_id", lote).order("id").range(a, b)))),
    Promise.all(lotesDe(externos).map(lote => leerTodas((a, b) => supabase.from("gastos_globales")
      .select(columnasGasto).eq("tenant_id", tenantId).in("id", lote).order("id").range(a, b)))),
  ]);
  if (datos.some(lote => lote.some(res => res.error)) || gastos.error || tenant.error
      || [...asignaciones, ...devoluciones, ...gastosExternos].some(res => res.error)) {
    return null;
  }

  const vinculados = asignaciones.flatMap(res => res.data ?? []);
  const gastosCompartidos = propios.reduce((suma, g) =>
    suma + (g.descripcion.startsWith("SII F29 · ") ? 0 : gastoDeResultado(g, vinculados)), 0);
  const reservaCompraPersonal = propios.filter(g => g.caja === "personal" && g.categoria === "compra_inventario")
    .reduce((suma, g) => suma + disponibleDeGasto(g, vinculados), 0);
  const ventas = datos.flatMap(([, v]) => v.data ?? []) as unknown as VentaChequeo[];
  const n = resumirChequeo(integrantes, datos.flatMap(([r]) => r.data ?? []) as AtencionChequeo[],
    ventas, gastosCompartidos, Number(chequeo.ahorro_pct),
    Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0),
    { comisionIsadoraPct: Number(chequeo.comision_isadora_pct ?? 10), parteMadrePct: Number(chequeo.reparto_pamela_pct ?? 50) },
    reservaCompraPersonal);
  const caja = resumirCajaChequeo(n, chequeo.id, [...propios, ...gastosExternos.flatMap(res => res.data ?? [])],
    vinculados, devoluciones.flatMap(res => res.data ?? []), retiros);
  return { n, caja, compartidos, ventas, tenant: tenant.data };
}

export async function cargarSiiMensual(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, hoy: string,
) {
  const periodo = hoy.slice(0, 7) + "-01";
  const [anio, mes] = periodo.split("-").map(Number);
  const siguiente = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);
  const [declaracion, conDocumento, sinDocumento, pagos] = await Promise.all([
    supabase.from("impuestos_mensuales").select("*").eq("tenant_id", tenantId).eq("periodo", periodo).maybeSingle(),
    leerTodas((a, b) => supabase.from("ventas").select("id,total").eq("tenant_id", tenantId).eq("anulada", false)
      .gte("boleta_fecha", periodo).lt("boleta_fecha", siguiente).order("id").range(a,b)),
    leerTodas((a, b) => supabase.from("ventas").select("id,total").eq("tenant_id", tenantId).eq("anulada", false)
      .is("boleta_fecha", null).gte("fecha", inicioDelDia(periodo)).lt("fecha", inicioDelDia(siguiente)).order("id").range(a,b)),
    leerTodas((a, b) => supabase.from("impuestos_pagos").select("id,gastos_globales:gasto_id(monto)")
      .eq("tenant_id", tenantId).eq("periodo", periodo).is("anulado_en", null).order("id").range(a,b)),
  ]);
  if (declaracion.error || conDocumento.error || sinDocumento.error || pagos.error) return null;
  const registradas = [...conDocumento.data, ...sinDocumento.data].reduce((suma, v) => suma + v.total, 0);
  const pagado = pagos.data.reduce((suma, p) => {
    const gasto = p.gastos_globales as unknown as { monto: number } | null;
    return suma + (gasto?.monto ?? 0);
  }, 0);
  const formulario = (declaracion.data as MesImpuesto | null) ?? { periodo, ventas_afectas: null, credito_fiscal: 0,
    ppm: 0, otros: 0, recargos: 0, total_declarado: null, vence_el: null, nota: "", version: -1 };
  return { ...impuestoDeMes(formulario, registradas, pagado, hoy), periodo, venceEl: formulario.vence_el };
}
