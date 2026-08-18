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

export function fechaLegible(fechaISO: string): string {
  return new Date(`${fechaISO}T12:00:00Z`).toLocaleDateString("es-CL", { timeZone: ZONA_CHILE });
}
