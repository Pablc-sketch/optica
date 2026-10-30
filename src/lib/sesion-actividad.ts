// Vencimiento de la sesión por inactividad.
//
// La sesión de Supabase se renueva sola y no vence nunca mientras el
// navegador guarde la cookie: quien tome un celular o un computador ya
// abierto entra directo a fichas de pacientes y plata. Esto agrega un
// segundo candado: si pasan más de HORAS_INACTIVIDAD sin usar la app, se
// cierra la sesión y hay que ingresar de nuevo con clave.
export const COOKIE_ACTIVIDAD = "lentia_actividad";
export const HORAS_INACTIVIDAD = 8;
// No se reescribe la cookie en cada clic: basta con avisar cada tanto.
export const REFRESCO_MINUTOS = 5;

const MS_HORA = 3600_000;
const MS_MINUTO = 60_000;

export function leerActividad(valor: string | undefined | null): number | null {
  if (!valor || !/^\d{10,15}$/.test(valor)) return null;
  return Number(valor);
}

// Sin marca de actividad (sesión anterior a este candado, o recién
// ingresada) no se vence: se la marca desde ahora.
export function sesionVencida(ultimo: number | null, ahora: number, horas = HORAS_INACTIVIDAD): boolean {
  if (ultimo === null) return false;
  if (ultimo > ahora + MS_MINUTO) return true; // marca del futuro: alterada
  return ahora - ultimo > horas * MS_HORA;
}

export function hayQueRefrescar(ultimo: number | null, ahora: number): boolean {
  return ultimo === null || ahora - ultimo >= REFRESCO_MINUTOS * MS_MINUTO;
}
