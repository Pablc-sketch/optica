import { diaDeLaSemana, fechaLegible, horaCorta, sumarDias } from "@/lib/fechas";

export const RUTA_AGENDA = "/operativos/agenda";

export type RangoFechasAgenda = { fecha: string; fecha_fin: string | null };

export type HorarioAgenda = RangoFechasAgenda & {
  hora_inicio: string | null;
  hora_fin: string | null;
};

export type EventoAgenda = HorarioAgenda & {
  id: string;
  tipo: "propio" | "externo";
  nombre: string;
  direccion: string | null;
  notas: string | null;
  estado: "pendiente" | "confirmado" | "realizado" | "cancelado";
  optica: string | null;
};

export type BloqueLibre = RangoFechasAgenda & { id: string };

// Un día sin compromisos solo está libre si se declaró disponibilidad.
// Los compromisos pendientes también reservan el día completo.
export function estadoDiaAgenda(bloques: BloqueLibre[], eventos: EventoAgenda[], dia: string) {
  const activos = eventos.filter(e => e.estado !== "cancelado" && cubreDia(e, dia));
  if (activos.some(e => e.estado !== "pendiente")) return "ocupado";
  if (activos.length) return "reservado";
  return bloques.some(b => cubreDia(b, dia)) ? "disponible" : "sin_confirmar";
}

export function fechaAgendaValida(s: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}

export function fechasAgendaValidas(desde: string, hasta: string) {
  return fechaAgendaValida(desde) && fechaAgendaValida(hasta) && desde <= hasta
    && Date.parse(hasta) - Date.parse(desde) <= 365 * 86_400_000;
}

export function horarioAgendaValido(inicio: string, fin: string) {
  const horaValida = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return horaValida.test(inicio) && horaValida.test(fin) && inicio < fin;
}

function fechaTermino(rango: RangoFechasAgenda) {
  return rango.fecha_fin && rango.fecha_fin >= rango.fecha ? rango.fecha_fin : rango.fecha;
}

export function cubreDia(rango: RangoFechasAgenda, dia: string) {
  return rango.fecha <= dia && fechaTermino(rango) >= dia;
}

export function mostrarFechas(rango: RangoFechasAgenda) {
  const fin = fechaTermino(rango);
  return fin === rango.fecha ? fechaLegible(rango.fecha) : `${fechaLegible(rango.fecha)} al ${fechaLegible(fin)}`;
}

function horas(h: Pick<HorarioAgenda, "hora_inicio" | "hora_fin">): [string, string] {
  // Con horas incompletas no se puede ofrecer el resto del día como libre.
  const inicio = horaCorta(h.hora_inicio);
  const fin = horaCorta(h.hora_fin);
  return inicio && fin && inicio < fin ? [inicio, fin] : ["00:00", "24:00"];
}

export function buscarCruce(h: HorarioAgenda, eventos: EventoAgenda[], excluir?: string) {
  const [inicio, fin] = horas(h);
  return eventos.find(e => {
    if (e.id === excluir || e.estado === "cancelado") return false;
    if (e.fecha > fechaTermino(h) || fechaTermino(e) < h.fecha) return false;
    if (e.tipo === "externo") return true;
    const [a, b] = horas(e);
    return a < fin && b > inicio;
  });
}

export function rangosDisponibles(
  bloques: BloqueLibre[], eventos: EventoAgenda[], desde: string, hasta: string,
): RangoFechasAgenda[] {
  const ocupados = eventos.filter(e => e.estado !== "cancelado");
  const rangos: RangoFechasAgenda[] = [];
  let actual: RangoFechasAgenda | undefined;
  for (let dia = desde; dia <= hasta; dia = sumarDias(dia, 1)) {
    if (!bloques.some(b => cubreDia(b, dia)) || ocupados.some(e => cubreDia(e, dia))) {
      actual = undefined;
    } else if (actual) {
      actual.fecha_fin = dia;
    } else {
      actual = { fecha: dia, fecha_fin: null };
      rangos.push(actual);
    }
    if (dia === hasta) break;
  }
  return rangos;
}

export function urlAgenda(dia: string, extra: Record<string, string> = {}) {
  return RUTA_AGENDA + "?" + new URLSearchParams({ mes: dia.slice(0, 7), dia, ...extra });
}

export function diaBreve(fecha: string) {
  return diaDeLaSemana(fecha).slice(0, 3) + " " + Number(fecha.slice(8));
}
