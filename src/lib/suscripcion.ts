import { hoyEnChile } from "./fechas";

export type Suscripcion = {
  plan: string;
  estado: string;
  fecha_inicio: string;
  fecha_renovacion: string;
  medio_pago: string | null;
};

// Días civiles de Chile que quedan hasta la fecha de renovación, contando
// ese día como el último vigente: mismo criterio que la base
// (suscripcion_vigente compara contra la fecha de hoy en America/Santiago).
// Antes se usaba la hora local del servidor y Math.ceil: el 02/10 a las
// 09:00 de Chile, una suscripción que vencía el 01/10 todavía salía
// vigente en la pantalla aunque la base ya la bloqueaba (A13).
export function diasRestantes(fechaRenovacion: string, hoy: string = hoyEnChile()): number {
  const dia = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((dia(fechaRenovacion) - dia(hoy)) / 86_400_000);
}

// Una suscripción cancelada o marcada vencida bloquea; un trial o plan
// activo bloquea recién cuando pasa la fecha de renovación.
export function estaVigente(s: Suscripcion | null, hoy: string = hoyEnChile()): boolean {
  if (!s) return true; // sin registro no bloqueamos: dato incompleto, no impago
  if (s.estado !== "trial" && s.estado !== "activa") return false;
  return diasRestantes(s.fecha_renovacion, hoy) >= 0;
}
