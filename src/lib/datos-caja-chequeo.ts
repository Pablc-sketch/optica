import "server-only";
import type { createClient } from "./supabase/server";
import { gastoDeResultado, resumirCajaChequeo } from "./caja-chequeo";
import { resumirChequeo, type AtencionChequeo, type Chequeo, type SedeChequeo, type VentaChequeo } from "./chequeos";
import { inicioDelDia, sumarDias } from "./fechas";
import { impuestoDeMes, ivaDelChequeo, periodoTributario, type MesImpuesto } from "./impuestos";
import { leerTodas } from "./leer-todas";
import { repartoPorOperativo } from "./reparto-operativos";
import { disponibleDeGasto } from "./pagos-operativo";

export const COLUMNAS_CHEQUEO = "id,nombre,desde,hasta,ahorro_pct,comision_isadora_pct,reparto_pamela_pct";
type Cliente = Awaited<ReturnType<typeof createClient>>;

const columnasGasto = "id,fecha,descripcion,monto,caja,categoria,operativo_id,chequeo_id,nota,monto_estimado";
const columnasAsignacion = "id,gasto_id,operativo_id,clave,monto,anulado_en";

function lotesDe(ids: string[]) {
  const lotes = [];
  for (let i = 0; i < ids.length; i += 50) lotes.push(ids.slice(i, i + 50));
  return lotes;
}

export function chequeoIndependiente(op: SedeChequeo): Chequeo {
  return { id: op.id, nombre: op.nombre, desde: op.fecha, hasta: op.fecha_fin ?? op.fecha,
    ahorro_pct: Number(op.ahorro_pct), comision_isadora_pct: Number(op.comision_vendedora_pct),
    reparto_pamela_pct: 50, independiente: true };
}

export async function buscarAmbitoReparto(
  supabase: Cliente, tenantId: string, ambito: { operativo?: string; chequeo?: string },
) {
  const op = ambito.operativo ? await supabase.from("operativos").select("*")
    .eq("tenant_id", tenantId).eq("id", ambito.operativo).neq("estado", "cancelado").maybeSingle() : null;
  if (op && (op.error || !op.data)) return null;
  const sede = op?.data as SedeChequeo | undefined;
  const chequeoId = sede?.chequeo_id ?? ambito.chequeo;
  if (!chequeoId) return sede ? { chequeo: chequeoIndependiente(sede), sedes: [sede] } : null;
  const [grupo, integrantes] = await Promise.all([
    supabase.from("chequeos").select(COLUMNAS_CHEQUEO).eq("tenant_id", tenantId).eq("id", chequeoId).maybeSingle(),
    leerTodas((a, b) => supabase.from("operativos").select("*").eq("tenant_id", tenantId)
      .eq("chequeo_id", chequeoId).neq("estado", "cancelado").order("fecha").order("id").range(a, b)),
  ]);
  return grupo.error || !grupo.data || integrantes.error ? null
    : { chequeo: grupo.data as Chequeo, sedes: integrantes.data as SedeChequeo[] };
}

export async function cargarRepartoOperativo(supabase: Cliente, tenantId: string, id: string, hoy: string) {
  const ambito = await buscarAmbitoReparto(supabase, tenantId, { operativo: id });
  if (!ambito) return null;
  const datos = await cargarCajaChequeo(supabase, tenantId, ambito.chequeo, ambito.sedes, hoy);
  return datos ? { chequeo: ambito.chequeo, datos } : null;
}

export function rutaReparto(chequeo: Chequeo) {
  return `/caja?${chequeo.independiente ? "operativo" : "chequeo"}=${chequeo.id}#reparto`;
}

export async function cargarCajaChequeo(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string,
  chequeo: Chequeo, integrantes: SedeChequeo[], hoy: string,
) {
  const lotes = lotesDe(integrantes.map(s => s.id));
  const corte = inicioDelDia(sumarDias(hoy, 1));
  const [datos, gastos, tenant, retirosGrupo, retirosSinAsignar] = await Promise.all([
    Promise.all(lotes.map(lote => Promise.all([
      leerTodas((a, b) => supabase.from("recetas").select("id,operativo_id,paciente_id").eq("tenant_id", tenantId)
        .in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("ventas").select(
        `id,operativo_id,total,fecha,boleta_fecha,pagos_abonos(monto,medio_pago,fecha),
         venta_items(producto_id,cantidad,precio_unitario,descripcion,descuento,cristal_slot,
           ordenes_trabajo:ot_id(estado,costo_laboratorio,costo_laboratorio_2,tipo_lente,tratamiento,tipo_lente_2,tratamiento_2,marco_propio,marco_propio_2,armazon_producto_id,armazon_producto_id_2),
           productos:producto_id(costo,categoria))`
      ).eq("tenant_id", tenantId).eq("anulada", false).lt("fecha", corte).in("operativo_id", lote).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_globales").select(columnasGasto).eq("tenant_id", tenantId)
        .in("operativo_id", lote).lte("fecha", hoy).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("gastos_asignaciones").select(columnasAsignacion).eq("tenant_id", tenantId)
        .in("operativo_id", lote).is("anulado_en", null).order("id").range(a, b)),
      leerTodas((a, b) => supabase.from("retiros_sueldo").select("id,persona,monto,operativo_id,fecha,created_at").eq("tenant_id", tenantId)
        .in("operativo_id", lote).lte("fecha", hoy).order("id").range(a, b)),
    ]))),
    chequeo.independiente ? { data: [], error: null } : leerTodas((a, b) => supabase.from("gastos_globales")
      .select(columnasGasto).eq("tenant_id", tenantId).eq("chequeo_id", chequeo.id)
      .lte("fecha", hoy).order("fecha", { ascending: false }).order("id").range(a, b)),
    supabase.from("tenants").select("comision_debito_pct,comision_credito_pct,reparto_etiquetas").eq("id", tenantId).single(),
    chequeo.independiente ? { data: [], error: null } : leerTodas((a, b) => supabase.from("retiros_sueldo")
      .select("id,persona,monto,operativo_id,fecha,created_at").eq("tenant_id", tenantId).eq("chequeo_id", chequeo.id)
      .lte("fecha", hoy).order("id").range(a, b)),
    supabase.from("retiros_sueldo").select("id").eq("tenant_id", tenantId)
      .is("operativo_id", null).is("chequeo_id", null).neq("monto", 0)
      .gte("fecha", chequeo.desde.slice(0, 7) + "-01").lte("fecha", hoy).limit(1),
  ]);
  const compartidos = gastos.data ?? [];
  const directos = datos.flatMap(([, , g]) => g.data ?? []);
  const asignacionesLocales = datos.flatMap(([, , , a]) => a.data ?? []);
  const retiros = [...datos.flatMap(([, , , , r]) => r.data ?? []), ...(retirosGrupo.data ?? [])];
  const propios = [...new Map([...compartidos, ...directos].map(g => [g.id, g])).values()];
  const idsPropios = new Set(propios.map(g => g.id));
  const externos = [...new Set(asignacionesLocales.map(a => a.gasto_id).filter(id => !idsPropios.has(id)))];
  const lotesGasto = lotesDe([...idsPropios, ...externos]);
  type VentaFechada = Omit<VentaChequeo, "pagos_abonos"> & { fecha: string; boleta_fecha: string | null;
    pagos_abonos: { monto: number; medio_pago: string | null; fecha: string }[] };
  const ventas = (datos.flatMap(([, v]) => v.data ?? []) as unknown as VentaFechada[]).map(venta => ({
    ...venta, pagos_abonos: venta.pagos_abonos.filter(p => Date.parse(p.fecha) < Date.parse(corte)),
  }));
  const mesActual = hoy.slice(0, 7) + "-01";
  const ventasPorPeriodo = new Map<string, number>([[mesActual, 0]]);
  for (const venta of ventas) {
    const periodo = periodoTributario(venta);
    ventasPorPeriodo.set(periodo, (ventasPorPeriodo.get(periodo) ?? 0) + venta.total);
  }
  const [asignaciones, devoluciones, gastosExternos, periodos] = await Promise.all([
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("gastos_asignaciones")
      .select(columnasAsignacion).eq("tenant_id", tenantId).in("gasto_id", lote).is("anulado_en", null).order("id").range(a, b)))),
    Promise.all(lotesGasto.map(lote => leerTodas((a, b) => supabase.from("caja_movimientos")
      .select("id,gasto_id,monto").eq("tenant_id", tenantId).eq("tipo", "devolucion").in("gasto_id", lote).lte("fecha", hoy).order("id").range(a, b)))),
    Promise.all(lotesDe(externos).map(lote => leerTodas((a, b) => supabase.from("gastos_globales")
      .select(columnasGasto).eq("tenant_id", tenantId).in("id", lote).lte("fecha", hoy).order("id").range(a, b)))),
    Promise.all([...ventasPorPeriodo].map(async ([periodo, monto]) => ({
      periodo, monto, sii: await cargarSiiPeriodo(supabase, tenantId, periodo, hoy),
    }))),
  ]);
  if (datos.some(lote => lote.some(res => res.error)) || gastos.error || tenant.error || retirosGrupo.error || retirosSinAsignar.error
      || [...asignaciones, ...devoluciones, ...gastosExternos].some(res => res.error)) {
    return null;
  }

  const vinculados = asignaciones.flatMap(res => res.data ?? []);
  const gastosSii = new Set(periodos.flatMap(p => p.sii?.gastosSii ?? []));
  const gastosDirectos = new Map<string, number>();
  let gastosCompartidos = 0;
  for (const gasto of propios) {
    if (gastosSii.has(gasto.id) || gasto.descripcion.startsWith("SII F29 · ")) continue;
    const importe = gastoDeResultado(gasto, vinculados);
    gastosCompartidos += importe;
    if (gasto.operativo_id) gastosDirectos.set(gasto.operativo_id, (gastosDirectos.get(gasto.operativo_id) ?? 0) + importe);
  }
  const reservaCompraPersonal = propios.filter(g => g.caja === "personal" && g.categoria === "compra_inventario")
    .reduce((suma, g) => suma + disponibleDeGasto(g, vinculados), 0);
  const iva = periodos.reduce((suma, p) => suma + ivaDelChequeo(p.monto, p.sii), 0);
  const ivaSinCredito = periodos.some(p => p.monto > 0 && !p.sii?.registrado);
  const n = resumirChequeo(integrantes, datos.flatMap(([r]) => r.data ?? []) as AtencionChequeo[],
    ventas, gastosCompartidos,
    Number(tenant.data?.comision_debito_pct ?? 0), Number(tenant.data?.comision_credito_pct ?? 0),
    chequeo.independiente ? undefined : Number(chequeo.comision_isadora_pct ?? 10),
    reservaCompraPersonal, iva);
  const caja = resumirCajaChequeo(n, chequeo.id, [...propios, ...gastosExternos.flatMap(res => res.data ?? [])],
    vinculados, devoluciones.flatMap(res => res.data ?? []), retiros, gastosSii,
    { ahorroPct: Number(chequeo.ahorro_pct), parteMadrePct: Number(chequeo.reparto_pamela_pct ?? 50) });
  const repartoOperativos = repartoPorOperativo(n, caja, retiros, gastosDirectos);
  return { n: { ...n, reparto: caja.reparto }, caja, repartoOperativos, compartidos, ventas, ivaSinCredito,
    retirosSinAsignar: Boolean(retirosSinAsignar.data?.length), retiros, sii: periodos.find(p => p.periodo === mesActual)?.sii ?? null, tenant: tenant.data };
}

async function cargarSiiPeriodo(
  supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string, periodo: string, hoy: string,
) {
  const [anio, mes] = periodo.split("-").map(Number);
  const siguiente = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10);
  const [declaracion, conDocumento, sinDocumento, pagos] = await Promise.all([
    supabase.from("impuestos_mensuales").select("*").eq("tenant_id", tenantId).eq("periodo", periodo).maybeSingle(),
    leerTodas((a, b) => supabase.from("ventas").select("id,total").eq("tenant_id", tenantId).eq("anulada", false)
      .gte("boleta_fecha", periodo).lt("boleta_fecha", siguiente).order("id").range(a,b)),
    leerTodas((a, b) => supabase.from("ventas").select("id,total").eq("tenant_id", tenantId).eq("anulada", false)
      .is("boleta_fecha", null).gte("fecha", inicioDelDia(periodo)).lt("fecha", inicioDelDia(siguiente)).order("id").range(a,b)),
    leerTodas((a, b) => supabase.from("impuestos_pagos").select("id,gasto_id,gastos_globales:gasto_id(monto)")
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
  const calculo = impuestoDeMes(formulario, registradas, pagado, hoy);
  return { ...calculo, registrado: Boolean(declaracion.data), periodo, siguiente, venceEl: formulario.vence_el, registradas,
    afectas: formulario.ventas_afectas ?? registradas, creditoFiscal: formulario.credito_fiscal,
    ivaPendiente: Math.min(calculo.iva, calculo.saldo), gastosSii: pagos.data.map(p => p.gasto_id) };
}
