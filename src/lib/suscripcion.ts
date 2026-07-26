export type Suscripcion = {
  plan: string;
  estado: string;
  fecha_inicio: string;
  fecha_renovacion: string;
  medio_pago: string | null;
};

export function diasRestantes(fechaRenovacion: string): number {
  const fin = new Date(fechaRenovacion + "T23:59:59").getTime();
  return Math.ceil((fin - Date.now()) / (24 * 3600 * 1000));
}

// Una suscripción cancelada o marcada vencida bloquea; un trial o plan
// activo bloquea recién cuando pasa la fecha de renovación.
export function estaVigente(s: Suscripcion | null): boolean {
  if (!s) return true; // sin registro no bloqueamos: dato incompleto, no impago
  if (s.estado === "cancelada" || s.estado === "vencida") return false;
  return diasRestantes(s.fecha_renovacion) >= 0;
}
