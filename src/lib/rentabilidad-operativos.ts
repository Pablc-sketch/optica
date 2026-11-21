import { gastosDeOperativo, type GastosOperativo } from "@/lib/gastos-operativo";
import { costoDeItems, type ItemConCosto } from "@/lib/costo-venta";

// Rentabilidad de cada operativo con los mismos criterios de "Comparar
// operativos": conversión por persona, cortesías ($0) no cuentan como venta,
// y la utilidad descuenta gastos del operativo + costo real de lo vendido.
// Sin React y sin base de datos, para usarlo también en el asistente de IA.

export type OperativoRentabilidad = GastosOperativo & {
  id: string;
  nombre: string;
  tipo_venue: string | null;
  fecha: string;
  estado: string;
  comuna?: string | null;
  costo_marco_unitario?: number | null;
};
export type RecetaRentabilidad = { operativo_id: string | null; paciente_id: string | null };
export type VentaRentabilidad = {
  operativo_id: string | null;
  total: number;
  paciente_id: string | null;
  venta_items?: unknown[] | null;
};

export type FilaRentabilidad<O extends OperativoRentabilidad = OperativoRentabilidad> = O & {
  examenes: number;
  ventasCantidad: number;
  vendido: number;
  gastos: number;
  costoProductos: number;
  costos: number;
  utilidad: number;
  conversion: number;
};

export function filasRentabilidad<O extends OperativoRentabilidad>(
  operativos: O[],
  recetas: RecetaRentabilidad[],
  ventas: VentaRentabilidad[]
): FilaRentabilidad<O>[] {
  // Conversión contada por PERSONA, no por receta: alguien puede salir con
  // dos recetas del mismo operativo y eso no lo convierte en dos pacientes.
  const examinados = new Map<string, Set<string>>();
  for (const r of recetas) {
    if (!r.operativo_id || !r.paciente_id) continue;
    if (!examinados.has(r.operativo_id)) examinados.set(r.operativo_id, new Set());
    examinados.get(r.operativo_id)!.add(r.paciente_id);
  }
  const porId = new Map(operativos.map((o) => [o.id, o]));
  const ventasPorOperativo = new Map<string, { cantidad: number; total: number; costoProductos: number; pagaron: Set<string> }>();
  for (const v of ventas) {
    if (!v.operativo_id) continue;
    const actual = ventasPorOperativo.get(v.operativo_id) ?? { cantidad: 0, total: 0, costoProductos: 0, pagaron: new Set<string>() };
    actual.total += v.total;
    actual.costoProductos += costoDeItems(
      (v.venta_items ?? []) as ItemConCosto[],
      porId.get(v.operativo_id)?.costo_marco_unitario ?? undefined
    );
    // Una cortesía ($0) es atención, no venta.
    if (v.total > 0) {
      actual.cantidad += 1;
      if (v.paciente_id) actual.pagaron.add(v.paciente_id);
    }
    ventasPorOperativo.set(v.operativo_id, actual);
  }
  return operativos.map((o) => {
    const examenes = examinados.get(o.id)?.size ?? 0;
    const venta = ventasPorOperativo.get(o.id) ?? { cantidad: 0, total: 0, costoProductos: 0, pagaron: new Set<string>() };
    const gastos = gastosDeOperativo(o);
    const costos = gastos + venta.costoProductos;
    return {
      ...o,
      examenes,
      ventasCantidad: venta.cantidad,
      vendido: venta.total,
      gastos,
      costoProductos: venta.costoProductos,
      costos,
      utilidad: venta.total - costos,
      conversion: examenes > 0 ? (venta.pagaron.size / examenes) * 100 : 0,
    };
  });
}

export type ResumenGrupo = {
  grupo: string;
  operativos: number;
  examenes: number;
  ventas: number;
  vendido: number;
  gastos: number;
  utilidad: number;
  utilidadPromedio: number;
  conversion: number | null;
  ticketPromedio: number | null;
  ultimaFecha: string;
};

// Agrupa filas (por tipo de lugar, comuna o nombre) para ver dónde conviene
// repetir. Ordenado por utilidad total.
export function resumirPorGrupo(filas: FilaRentabilidad[], grupoDe: (f: FilaRentabilidad) => string): ResumenGrupo[] {
  const grupos = new Map<string, ResumenGrupo>();
  for (const f of filas) {
    const clave = grupoDe(f) || "Sin dato";
    const g = grupos.get(clave) ?? {
      grupo: clave, operativos: 0, examenes: 0, ventas: 0, vendido: 0, gastos: 0, utilidad: 0,
      utilidadPromedio: 0, conversion: null, ticketPromedio: null, ultimaFecha: f.fecha,
    };
    g.operativos += 1;
    g.examenes += f.examenes;
    g.ventas += f.ventasCantidad;
    g.vendido += f.vendido;
    g.gastos += f.gastos;
    g.utilidad += f.utilidad;
    if (f.fecha > g.ultimaFecha) g.ultimaFecha = f.fecha;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      utilidadPromedio: Math.round(g.utilidad / g.operativos),
      conversion: g.examenes > 0 ? Math.round((g.ventas / g.examenes) * 1000) / 10 : null,
      ticketPromedio: g.ventas > 0 ? Math.round(g.vendido / g.ventas) : null,
    }))
    .sort((a, b) => b.utilidad - a.utilidad);
}

// ---------------------------------------------------------------------------
// Evaluar un punto nuevo o repetido: proyección con el historial real de la
// óptica. Los números los calcula este código (no la IA), para que la
// respuesta no dependa de que el modelo haga bien las cuentas.
// ---------------------------------------------------------------------------

export type SupuestosPunto = {
  dias: number;
  examenesEsperados?: number | null;
  costos: { transporte?: number; arriendo?: number; viaticos?: number; personal?: number; equipos?: number; otros?: number };
};

export type EvaluacionPunto = {
  base: { operativos: number; criterio: string };
  examenesPorDia: number;
  examenesEsperados: number;
  conversion: number;
  ticketPromedio: number;
  margenProductos: number;
  gastosEstimados: number;
  ventasEsperadas: number;
  vendidoEsperado: number;
  utilidadEsperada: number;
  examenesParaEmpatar: number | null;
  escenarios: { nombre: string; examenes: number; utilidad: number }[];
  veredicto: "rentable" | "justo" | "no_rentable" | "sin_datos";
};

const diasDe = (f: { fecha: string; fecha_fin?: string | null }) => {
  if (!f.fecha_fin || f.fecha_fin <= f.fecha) return 1;
  const d = (Date.parse(f.fecha_fin) - Date.parse(f.fecha)) / 86400000;
  return Math.max(1, Math.round(d) + 1);
};

export function evaluarPunto(
  historial: (FilaRentabilidad & { fecha_fin?: string | null })[],
  supuestos: SupuestosPunto,
  criterio: string
): EvaluacionPunto {
  const realizados = historial.filter((f) => f.estado !== "cancelado" && f.examenes > 0);
  const dias = Math.max(1, Math.min(30, Math.round(supuestos.dias || 1)));
  const c = supuestos.costos;
  const gastosEstimados = [c.transporte, c.arriendo, c.viaticos, c.personal, c.equipos, c.otros]
    .reduce<number>((s, v) => s + Math.max(0, Math.round(v ?? 0)), 0);
  if (realizados.length === 0) {
    return {
      base: { operativos: 0, criterio }, examenesPorDia: 0, examenesEsperados: supuestos.examenesEsperados ?? 0,
      conversion: 0, ticketPromedio: 0, margenProductos: 0, gastosEstimados, ventasEsperadas: 0, vendidoEsperado: 0,
      utilidadEsperada: -gastosEstimados, examenesParaEmpatar: null, escenarios: [], veredicto: "sin_datos",
    };
  }
  const tot = realizados.reduce(
    (s, f) => ({ examenes: s.examenes + f.examenes, dias: s.dias + diasDe(f), ventas: s.ventas + f.ventasCantidad, vendido: s.vendido + f.vendido, costoProductos: s.costoProductos + f.costoProductos }),
    { examenes: 0, dias: 0, ventas: 0, vendido: 0, costoProductos: 0 }
  );
  const examenesPorDia = tot.examenes / tot.dias;
  const conversion = tot.ventas / tot.examenes;
  const ticketPromedio = tot.ventas > 0 ? tot.vendido / tot.ventas : 0;
  // Margen que deja cada peso vendido después de cristales y marcos.
  const margenProductos = tot.vendido > 0 ? (tot.vendido - tot.costoProductos) / tot.vendido : 0;
  const aporteProExamen = conversion * ticketPromedio * margenProductos;
  const utilidadCon = (examenes: number) => Math.round(examenes * aporteProExamen - gastosEstimados);
  const examenesEsperados = supuestos.examenesEsperados && supuestos.examenesEsperados > 0
    ? Math.round(supuestos.examenesEsperados)
    : Math.round(examenesPorDia * dias);
  const utilidadEsperada = utilidadCon(examenesEsperados);
  const examenesParaEmpatar = aporteProExamen > 0 ? Math.ceil(gastosEstimados / aporteProExamen) : null;
  const escenarios = [
    { nombre: "Bajo (-30%)", examenes: Math.round(examenesEsperados * 0.7) },
    { nombre: "Esperado", examenes: examenesEsperados },
    { nombre: "Alto (+30%)", examenes: Math.round(examenesEsperados * 1.3) },
  ].map((e) => ({ ...e, utilidad: utilidadCon(e.examenes) }));
  const veredicto = utilidadEsperada <= 0 ? "no_rentable" : escenarios[0].utilidad <= 0 ? "justo" : "rentable";
  return {
    base: { operativos: realizados.length, criterio },
    examenesPorDia: Math.round(examenesPorDia * 10) / 10,
    examenesEsperados,
    conversion: Math.round(conversion * 1000) / 10,
    ticketPromedio: Math.round(ticketPromedio),
    margenProductos: Math.round(margenProductos * 1000) / 10,
    gastosEstimados,
    ventasEsperadas: Math.round(examenesEsperados * conversion * 10) / 10,
    vendidoEsperado: Math.round(examenesEsperados * conversion * ticketPromedio),
    utilidadEsperada,
    examenesParaEmpatar,
    escenarios,
    veredicto,
  };
}
