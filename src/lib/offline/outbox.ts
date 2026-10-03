import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoVenta, VentaInput } from "@/lib/actions/ventas";

// Cola local de ventas hechas sin conexión (spec 8.2).
//
// Lo que corrigió la auditoría (A04) y por qué está escrito así:
//   - Antes se leía la cola, se esperaba al servidor y se REESCRIBÍA desde
//     esa copia vieja: una venta encolada mientras tanto desaparecía. Ahora
//     cada cambio vuelve a leer la cola en ese instante y saca solo lo que
//     se confirmó, por id.
//   - Antes un error permanente borraba la venta y guardaba solo el
//     mensaje. Ahora pasa a "fallidas" con TODO su contenido, para verla,
//     reintentarla o descartarla a conciencia.
//   - Antes la cola era una sola para el navegador. Ahora es por usuario:
//     dos personas en el mismo equipo no se mezclan, y cerrar sesión no
//     borra lo pendiente de nadie.
//   - Una sola sincronización a la vez (también entre pestañas, con Web
//     Locks): dos intentos simultáneos no mandan la misma venta dos veces.
//     Igual, si pasara, el servidor la reconoce por su id y no la duplica.

export type VentaPendiente = {
  id: string;
  input: VentaInput;
  creada: string;
  intentos: number;
};

export type VentaFallida = VentaPendiente & { error: string; fallida: string };

export const OUTBOX_EVENT = "optica-outbox-changed";

const clave = (usuarioId: string, tipo: "pendientes" | "fallidas") => `optica.outbox.v2.${usuarioId}.${tipo}`;

// Formato antiguo (una cola global de filas sueltas). Se sigue leyendo
// para no perder nada que haya quedado guardado antes de este cambio.
const CLAVE_LEGADO = "optica.outbox.v1";

function leer<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function escribir(key: string, items: unknown[]) {
  window.localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

// Modifica la lista leyendo SIEMPRE lo que hay ahora, no una copia previa.
function modificar<T>(key: string, cambio: (actual: T[]) => T[]) {
  escribir(key, cambio(leer<T>(key)));
}

export function pendientes(usuarioId: string): VentaPendiente[] {
  return leer<VentaPendiente>(clave(usuarioId, "pendientes"));
}

export function fallidas(usuarioId: string): VentaFallida[] {
  return leer<VentaFallida>(clave(usuarioId, "fallidas"));
}

export function legadoPendiente(): number {
  return leer(CLAVE_LEGADO).length;
}

export function encolarVenta(usuarioId: string, input: VentaInput) {
  modificar<VentaPendiente>(clave(usuarioId, "pendientes"), (cola) =>
    cola.some((v) => v.id === input.ventaId)
      ? cola
      : [...cola, { id: input.ventaId, input, creada: new Date().toISOString(), intentos: 0 }]
  );
}

export function reintentarFallida(usuarioId: string, id: string) {
  const venta = fallidas(usuarioId).find((v) => v.id === id);
  if (!venta) return;
  modificar<VentaFallida>(clave(usuarioId, "fallidas"), (l) => l.filter((v) => v.id !== id));
  modificar<VentaPendiente>(clave(usuarioId, "pendientes"), (cola) =>
    cola.some((v) => v.id === id)
      ? cola
      : [...cola, { id: venta.id, input: venta.input, creada: venta.creada, intentos: venta.intentos }]
  );
}

export function descartarFallida(usuarioId: string, id: string) {
  modificar<VentaFallida>(clave(usuarioId, "fallidas"), (l) => l.filter((v) => v.id !== id));
}

type Enviar = (input: VentaInput) => Promise<ResultadoVenta>;

let sincronizando: Promise<ResumenSync> | null = null;

export type ResumenSync = { aplicadas: number; fallidas: number; pendientes: number; sinConexion: boolean };

// Empuja la cola de este usuario, una venta a la vez y en orden.
export function sincronizar(usuarioId: string, enviar: Enviar, supabase?: SupabaseClient): Promise<ResumenSync> {
  if (sincronizando) return sincronizando;
  const correr = async () => {
    const trabajo = () => vaciarCola(usuarioId, enviar, supabase);
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (locks) {
      return locks.request(`optica-sync-${usuarioId}`, { ifAvailable: true }, async (lock) =>
        lock ? trabajo() : { aplicadas: 0, fallidas: fallidas(usuarioId).length, pendientes: pendientes(usuarioId).length, sinConexion: false }
      );
    }
    return trabajo();
  };
  sincronizando = correr().finally(() => {
    sincronizando = null;
  });
  return sincronizando;
}

async function vaciarCola(usuarioId: string, enviar: Enviar, supabase?: SupabaseClient): Promise<ResumenSync> {
  let aplicadas = 0;
  const kPend = clave(usuarioId, "pendientes");
  const kFall = clave(usuarioId, "fallidas");

  if (supabase) await sincronizarLegado(supabase);

  // Se recorre por id, releyendo la cola cada vez: lo que se encole
  // durante la sincronización también entra, y nada se reescribe desde
  // una copia vieja.
  const vistas = new Set<string>();
  for (;;) {
    const siguiente = pendientes(usuarioId).find((v) => !vistas.has(v.id));
    if (!siguiente) break;
    vistas.add(siguiente.id);

    let resultado: ResultadoVenta;
    try {
      resultado = await enviar(siguiente.input);
    } catch {
      // Sin conexión o servidor caído: queda tal cual para el próximo intento.
      return { aplicadas, fallidas: fallidas(usuarioId).length, pendientes: pendientes(usuarioId).length, sinConexion: true };
    }

    if (resultado.ok) {
      modificar<VentaPendiente>(kPend, (cola) => cola.filter((v) => v.id !== siguiente.id));
      aplicadas++;
    } else {
      // El servidor la rechazó (permiso, receta cambiada, dato inválido):
      // se aparta con TODO su contenido para revisarla, no se borra.
      modificar<VentaPendiente>(kPend, (cola) => cola.filter((v) => v.id !== siguiente.id));
      modificar<VentaFallida>(kFall, (l) => [
        ...l.filter((v) => v.id !== siguiente.id),
        { ...siguiente, intentos: siguiente.intentos + 1, error: resultado.error, fallida: new Date().toISOString() },
      ]);
    }
  }

  return { aplicadas, fallidas: fallidas(usuarioId).length, pendientes: pendientes(usuarioId).length, sinConexion: false };
}

// Cola del formato antiguo: se envía con la función de entonces y se
// saca SOLO lo confirmado, releyendo la cola al final (el error de antes).
type CambioLegado = { tabla: string; op: string; id: string; datos: Record<string, unknown> };
async function sincronizarLegado(supabase: SupabaseClient) {
  const cola = leer<CambioLegado>(CLAVE_LEGADO);
  if (cola.length === 0) return;
  const { data, error } = await supabase.rpc("sync_aplicar_cambios", { p_cambios: cola });
  if (error) return;
  const aplicados = new Set<string>((data?.aplicados ?? []) as string[]);
  modificar<CambioLegado>(CLAVE_LEGADO, (actual) => actual.filter((c) => !aplicados.has(c.id)));
}
