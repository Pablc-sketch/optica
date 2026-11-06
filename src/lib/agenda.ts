import { diaDeLaSemana, horaCorta, ZONA_CHILE } from "@/lib/fechas";

export const RUTA_AGENDA = "/operativos/agenda";

export type HorarioAgenda = {
  fecha: string;
  fecha_fin: string | null;
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

export type BloqueLibre = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
};

export function fechaAgendaValida(s: string) {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T12:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === s;
}

export function rangoAgendaValido(desde: string, hasta: string, inicio: string, fin: string) {
  const horaValida = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return fechaAgendaValida(desde) && fechaAgendaValida(hasta) && desde <= hasta
    && Date.parse(hasta) - Date.parse(desde) <= 365 * 86_400_000
    && horaValida.test(inicio) && horaValida.test(fin) && inicio < fin;
}

export function cubreDia(h: HorarioAgenda, dia: string) {
  return h.fecha <= dia && (!h.fecha_fin || h.fecha_fin < h.fecha ? h.fecha : h.fecha_fin) >= dia;
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
    if (e.fecha > (h.fecha_fin ?? h.fecha) || (e.fecha_fin ?? e.fecha) < h.fecha) return false;
    const [a, b] = horas(e);
    return a < fin && b > inicio;
  });
}

export function horaActualEnChile() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_CHILE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

export function horariosLibres(bloques: BloqueLibre[], eventos: EventoAgenda[], desde: string, horaDesde?: string): BloqueLibre[] {
  return bloques.filter(b => b.fecha >= desde).flatMap(b => {
    let libres: [string, string][] = [horas(b)];
    for (const evento of eventos) {
      if (evento.estado === "cancelado" || !cubreDia(evento, b.fecha)) continue;
      const [a, z] = horas(evento);
      libres = libres.flatMap(([inicio, fin]): [string, string][] => {
        if (a >= fin || z <= inicio) return [[inicio, fin]];
        const partes: [string, string][] = [];
        if (inicio < a) partes.push([inicio, a]);
        if (z < fin) partes.push([z, fin]);
        return partes;
      });
    }
    return libres.filter(([, fin]) => b.fecha !== desde || !horaDesde || fin > horaDesde)
      .map(([hora_inicio, hora_fin]) => ({ id: b.id, fecha: b.fecha, hora_inicio, hora_fin }));
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora_inicio.localeCompare(b.hora_inicio));
}

export function urlAgenda(dia: string, extra: Record<string, string> = {}) {
  return RUTA_AGENDA + "?" + new URLSearchParams({ mes: dia.slice(0, 7), dia, ...extra });
}

export function diaBreve(fecha: string) {
  return diaDeLaSemana(fecha).slice(0, 3) + " " + Number(fecha.slice(8));
}
