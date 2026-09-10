// Fechas en la hora de Chile, no en UTC.
//
// El servidor corre en UTC, y Chile va 3 o 4 horas atrás. Calcular "hoy"
// con toISOString() hacía que, pasadas las 20:00 en Santiago, el sistema
// ya estuviera en la fecha siguiente: los filtros por día dejaban fuera
// todo lo registrado durante la tarde.

export const ZONA_CHILE = "America/Santiago";

const ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA_CHILE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// "2026-08-15" según el reloj chileno.
export function hoyEnChile(): string {
  return ISO.format(new Date());
}

// El día chileno al que pertenece un instante guardado en la base.
export function diaEnChile(instante: string | Date): string {
  return ISO.format(new Date(instante));
}

// Desfase horario de Chile en esa fecha. Se consulta en vez de fijarlo
// porque cambia con el horario de verano: -03:00 en verano, -04:00 en
// invierno.
export function desfaseChile(fechaISO: string): string {
  const parte = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONA_CHILE,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(`${fechaISO}T12:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value;
  return parte ? parte.replace("GMT", "") : "-04:00";
}

// Límites de un rango de días completos en hora chilena, listos para
// comparar contra una columna timestamptz.
export function inicioDelDia(fechaISO: string): string {
  return `${fechaISO}T00:00:00${desfaseChile(fechaISO)}`;
}

export function finDelDia(fechaISO: string): string {
  return `${fechaISO}T23:59:59${desfaseChile(fechaISO)}`;
}

// Se opera al mediodía UTC para que sumar o restar días nunca cruce por
// accidente un cambio de fecha.
export function restarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fechaISO: string, dias: number): string {
  return restarDias(fechaISO, -dias);
}

export function fechaLegible(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: ZONA_CHILE });
}

// "2026-09" según el reloj chileno — para reportes que se calculan mes a
// mes (ej. sueldos: se van sumando los operativos del mes y se reinician
// en el mes siguiente).
export function mesEnChile(): string {
  return hoyEnChile().slice(0, 7);
}

// Primer y último día de un mes "YYYY-MM", en formato de fecha simple
// (para comparar contra columnas `date`, no `timestamptz` — esas no
// llevan desfase horario).
export function primerDiaDelMes(mes: string): string {
  return `${mes}-01`;
}

export function ultimoDiaDelMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  // El día 0 del mes siguiente es el último día de este mes.
  const ultimo = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return `${mes}-${String(ultimo).padStart(2, "0")}`;
}

// Mes vecino, para las flechas del calendario: "2026-12" + 1 = "2027-01".
export function mesDesplazado(mes: string, meses: number): string {
  const [anio, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(anio, m - 1 + meses, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "2026-10" → "octubre de 2026", para el título del calendario.
export function nombreMes(mes: string): string {
  return new Date(`${mes}-01T12:00:00Z`).toLocaleDateString("es-CL", {
    timeZone: ZONA_CHILE,
    month: "long",
    year: "numeric",
  });
}

// La grilla del mes, semana por semana, con la semana partiendo en lunes
// (así se ve un calendario en Chile, no en domingo como el de EE.UU.).
// Los días de relleno antes del 1 y después del último van en null para
// que la celda quede vacía en vez de mostrar días del mes de al lado, que
// confunden al mirar rápido cuántos operativos hay "este mes".
export function semanasDelMes(mes: string): (string | null)[][] {
  const [anio, m] = mes.split("-").map(Number);
  const diasEnElMes = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  // getUTCDay() da 0 para domingo; con lunes primero el domingo es el 6.
  const primerDiaSemana = (new Date(Date.UTC(anio, m - 1, 1)).getUTCDay() + 6) % 7;

  const celdas: (string | null)[] = Array(primerDiaSemana).fill(null);
  for (let dia = 1; dia <= diasEnElMes; dia++) {
    celdas.push(`${mes}-${String(dia).padStart(2, "0")}`);
  }
  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

// Todos los días que ocupa un operativo, desde su fecha hasta su fecha de
// término. Un operativo de un día devuelve un solo día — es el caso más
// común, y así el calendario no necesita dos caminos distintos.
export function diasQueOcupa(fecha: string, fechaFin: string | null): string[] {
  if (!fechaFin || fechaFin <= fecha) return [fecha];
  const dias: string[] = [];
  // Tope de seguridad: un operativo no dura un año, y si un dato quedó mal
  // tipeado (2027 en vez de 2026) es mejor cortar que colgar la página.
  for (let d = fecha; d <= fechaFin && dias.length < 366; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

// "10:00:00" → "10:00". La base guarda `time` con segundos y en pantalla
// los segundos solo estorban.
export function horaCorta(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const m = String(valor).match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : null;
}

// "10:00 a 13:00", "desde las 10:00", "hasta las 13:00" — o null si no se
// anotó ninguna hora, que es distinto de "todo el día".
export function rangoHorario(inicio: string | null, fin: string | null): string | null {
  const a = horaCorta(inicio);
  const b = horaCorta(fin);
  if (a && b) return `${a} a ${b}`;
  if (a) return `desde las ${a}`;
  if (b) return `hasta las ${b}`;
  return null;
}

// Cuándo tocaría volver a un lugar: la fecha del último operativo más los
// meses que se hayan definido para ese lugar. Si el día no existe en el mes
// destino (31 de agosto + 6 meses), Postgres y JS difieren; acá se toma el
// último día del mes, que es lo que uno diría en voz alta ("a fines de
// febrero").
export function sumarMeses(fechaISO: string, meses: number): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const destino = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDia);
  return `${destino.getUTCFullYear()}-${String(destino.getUTCMonth() + 1).padStart(2, "0")}-${String(diaFinal).padStart(2, "0")}`;
}

// Cuánto pasó desde una fecha, dicho como se dice: "hace 3 meses", "hace
// 1 año y 2 meses". Los días sueltos no importan acá — lo que se está
// decidiendo es si ya toca volver a llamar, no una antigüedad exacta.
export function haceCuanto(fechaISO: string, hoyISO: string): string {
  const [a1, m1, d1] = fechaISO.split("-").map(Number);
  const [a2, m2, d2] = hoyISO.split("-").map(Number);
  let meses = (a2 - a1) * 12 + (m2 - m1);
  if (d2 < d1) meses -= 1;
  if (meses <= 0) {
    const dias = Math.round(
      (Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000
    );
    if (dias <= 0) return "hoy";
    if (dias === 1) return "hace 1 día";
    if (dias < 7) return `hace ${dias} días`;
    const semanas = Math.floor(dias / 7);
    return semanas === 1 ? "hace 1 semana" : `hace ${semanas} semanas`;
  }
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const parteAnios = anios === 1 ? "1 año" : `${anios} años`;
  if (resto === 0) return `hace ${parteAnios}`;
  return `hace ${parteAnios} y ${resto === 1 ? "1 mes" : `${resto} meses`}`;
}
