import { gastosDeOperativo, type GastosOperativo } from "@/lib/gastos-operativo";

// Lo que les falta a los operativos: ubicación, horario, inscritos, costos,
// contacto, o cerrar los que ya pasaron. Reglas fijas (sin IA), para que el
// aviso sea siempre el mismo y no cueste nada.

export type OperativoRevisable = GastosOperativo & {
  id: string;
  nombre: string;
  fecha: string;
  fecha_fin: string | null;
  estado: string;
  direccion: string | null;
  comuna: string | null;
  hora_inicio: string | null;
  meta_examenes: number | null;
};

export type Pendiente = { operativo_id: string; nombre: string; fecha: string; problemas: string[] };

const DIA = 86400000;
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA);

export function pendientesDeOperativos(ops: OperativoRevisable[], inscritos: Map<string, number>, hoy: string, conContacto?: Set<string>): Pendiente[] {
  const out: Pendiente[] = [];
  for (const o of ops) {
    if (o.estado === "cancelado") continue;
    const fin = o.fecha_fin && o.fecha_fin > o.fecha ? o.fecha_fin : o.fecha;
    const problemas: string[] = [];
    const gastos = gastosDeOperativo(o);

    if (fin < hoy) {
      if (o.estado === "planificado") problemas.push("Ya pasó y sigue como planificado: márcalo realizado o cancelado.");
      else if (o.estado === "realizado" && gastos === 0 && dias(fin, hoy) <= 90) problemas.push("Realizado sin costos registrados: la utilidad aparece más alta de lo real.");
    } else if (o.estado === "planificado") {
      const faltan = dias(hoy, o.fecha);
      if (!o.direccion && !o.comuna) problemas.push("Falta la ubicación (dirección y comuna).");
      else if (!o.direccion) problemas.push("Falta la dirección.");
      else if (!o.comuna) problemas.push("Falta la comuna.");
      if (!o.hora_inicio) problemas.push("Falta el horario.");
      const n = inscritos.get(o.id) ?? 0;
      if (n === 0 && faltan <= 21) problemas.push("No hay gente inscrita.");
      else if (o.meta_examenes && faltan <= 7 && n < o.meta_examenes / 2) problemas.push(`Pocos inscritos: ${n} de una meta de ${o.meta_examenes}.`);
      if (gastos === 0) problemas.push("Faltan los costos (transporte, equipos, comida…).");
      else {
        if (!o.costo_transporte) problemas.push("Falta el costo de transporte o combustible.");
        const largo = dias(o.fecha, fin) + 1;
        if (largo > 1 && !o.costo_hospedaje) problemas.push(`Dura ${largo} días y no tiene hospedaje anotado.`);
      }
      if (conContacto && !conContacto.has(o.id)) problemas.push("Falta el contacto (dirigente o encargado del lugar).");
    }
    if (problemas.length) out.push({ operativo_id: o.id, nombre: o.nombre, fecha: o.fecha, problemas });
  }
  // Primero los próximos (más urgentes), después los pasados.
  return out.sort((a, b) => {
    const pa = a.fecha >= hoy, pb = b.fecha >= hoy;
    if (pa !== pb) return pa ? -1 : 1;
    return pa ? a.fecha.localeCompare(b.fecha) : b.fecha.localeCompare(a.fecha);
  });
}

// ---------------------------------------------------------------------------
// Costos de referencia en Chile
// ---------------------------------------------------------------------------

// Valores de respaldo, aproximados, para cuando no hay historial propio ni
// búsqueda en internet. Se muestran siempre como referencia a verificar.
export const REFERENCIA_CHILE = {
  actualizado: "2026-11",
  combustible_litro: { bencina_93: 1300, diesel: 1000 },
  rendimiento_km_litro: { auto: 12, camioneta_o_van: 9 },
  colacion_por_persona_dia: { desde: 8000, hasta: 12000 },
  hospedaje_por_persona_noche: { desde: 25000, hasta: 45000 },
  nota: "Valores aproximados. Precio del combustible oficial y actualizado: Bencina en Línea (CNE). Peajes según ruta y TAG.",
} as const;

export type EstimacionCombustible = { km_total: number; litros: number; costo: number; supuestos: string };

// Ida y vuelta por cada día (se vuelve a dormir a la base), o un solo viaje
// si se aloja en el lugar.
export function estimarCombustible(p: { km_ida: number; dias: number; precio_litro: number; rendimiento_km_litro: number; se_aloja?: boolean }): EstimacionCombustible {
  const km = Math.max(0, p.km_ida);
  const viajes = p.se_aloja ? 1 : Math.max(1, Math.round(p.dias));
  const kmTotal = Math.round(km * 2 * viajes);
  const litros = Math.round((kmTotal / Math.max(1, p.rendimiento_km_litro)) * 10) / 10;
  return {
    km_total: kmTotal,
    litros,
    costo: Math.round(litros * p.precio_litro),
    supuestos: `${viajes} viaje${viajes === 1 ? "" : "s"} ida y vuelta de ${km} km, ${p.rendimiento_km_litro} km/L, $${p.precio_litro}/L`,
  };
}

type ConCostos = GastosOperativo & { fecha: string; fecha_fin: string | null; estado: string };

// Lo que la propia óptica ha gastado por día en cada categoría (solo
// operativos que anotaron ese gasto), en el último año.
export function promediosPropios(ops: ConCostos[], hoy: string) {
  const desde = new Date(Date.parse(hoy) - 365 * DIA).toISOString().slice(0, 10);
  const categorias = ["costo_transporte", "costo_viaticos", "costo_comida", "costo_hospedaje", "costo_equipos", "costo_arriendo", "costo_ayudante", "costo_peajes"] as const;
  const r: Record<string, { promedio_por_dia: number; operativos: number }> = {};
  for (const c of categorias) {
    let total = 0, nDias = 0, n = 0;
    for (const o of ops) {
      if (o.estado === "cancelado" || o.fecha < desde || o.fecha > hoy) continue;
      const v = (o as Record<string, unknown>)[c];
      if (typeof v !== "number" || v <= 0) continue;
      const d = o.fecha_fin && o.fecha_fin > o.fecha ? dias(o.fecha, o.fecha_fin) + 1 : 1;
      total += v; nDias += d; n++;
    }
    if (n > 0) r[c.replace("costo_", "")] = { promedio_por_dia: Math.round(total / nDias), operativos: n };
  }
  return r;
}
