import { ZONA_CHILE } from "./fechas";
export function fechaHoraChile(iso: string): string {
 const partes = new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA_CHILE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
 return partes.replace(" ", "T");
}
export function instanteChile(local: string): string {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new Error("Fecha y hora inválidas.");
 const base = Date.parse(local + ":00Z");
 for (const horas of [3, 4]) {
  const iso = new Date(base + horas * 3600000).toISOString();
  if (fechaHoraChile(iso) === local) return iso;
 }
 throw new Error("Esta fecha u hora no existe en Santiago. Revisa el horario.");
}
