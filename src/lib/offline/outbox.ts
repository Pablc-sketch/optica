import type { SupabaseClient } from "@supabase/supabase-js";

// Outbox local (spec 8.2): los cambios capturados sin conexión se guardan
// acá y se empujan al servidor con sync_aplicar_cambios() al reconectar.
// La RPC corre con el JWT del usuario, así que RLS aplica igual que online.

export type CambioSync = {
  tabla: string;
  op: "insert" | "update";
  id: string;
  datos: Record<string, unknown>;
  base_updated_at?: string;
};

export type ConflictoSync = {
  tabla: string;
  id: string;
  servidor: Record<string, unknown>;
};

const OUTBOX_KEY = "optica.outbox.v1";
const CONFLICTOS_KEY = "optica.conflictos.v1";
export const OUTBOX_EVENT = "optica-outbox-changed";

function leer<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function escribir(key: string, items: unknown[]) {
  window.localStorage.setItem(key, JSON.stringify(items));
  window.dispatchEvent(new Event(OUTBOX_EVENT));
}

export function pendientes(): CambioSync[] {
  return leer<CambioSync>(OUTBOX_KEY);
}

export function conflictos(): ConflictoSync[] {
  return leer<ConflictoSync>(CONFLICTOS_KEY);
}

export function encolar(cambios: CambioSync[]) {
  escribir(OUTBOX_KEY, [...pendientes(), ...cambios]);
}

export function descartarConflictos() {
  escribir(CONFLICTOS_KEY, []);
}

// Empuja todo el outbox. Los aplicados salen de la cola; los conflictos
// pasan a su propia lista para que el usuario decida; los errores
// permanentes también salen de la cola (quedan registrados como conflicto
// sin fila servidor) para no trabar el resto de la sincronización.
export async function sincronizar(supabase: SupabaseClient): Promise<{
  aplicados: number;
  conflictos: number;
  errores: number;
  pendientes: number;
}> {
  const cola = pendientes();
  if (cola.length === 0) {
    return { aplicados: 0, conflictos: conflictos().length, errores: 0, pendientes: 0 };
  }

  const { data, error } = await supabase.rpc("sync_aplicar_cambios", {
    p_cambios: cola,
  });

  if (error) {
    // Sin conexión o servidor caído: la cola queda intacta para reintentar.
    return { aplicados: 0, conflictos: conflictos().length, errores: 0, pendientes: cola.length };
  }

  const aplicados = new Set<string>((data?.aplicados ?? []) as string[]);
  const nuevosConflictos = (data?.conflictos ?? []) as ConflictoSync[];
  const errores = (data?.errores ?? []) as { tabla: string; id: string; error: string }[];
  const idsResueltos = new Set<string>([
    ...aplicados,
    ...nuevosConflictos.map((c) => c.id),
    ...errores.map((e) => e.id),
  ]);

  const restantes = cola.filter((c) => !idsResueltos.has(c.id));
  escribir(OUTBOX_KEY, restantes);

  if (nuevosConflictos.length > 0 || errores.length > 0) {
    escribir(CONFLICTOS_KEY, [
      ...conflictos(),
      ...nuevosConflictos,
      ...errores.map((e) => ({ tabla: e.tabla, id: e.id, servidor: { error: e.error } })),
    ]);
  }

  return {
    aplicados: aplicados.size,
    conflictos: conflictos().length,
    errores: errores.length,
    pendientes: restantes.length,
  };
}
