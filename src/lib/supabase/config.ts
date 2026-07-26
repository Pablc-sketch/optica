// Supabase renombró sus claves: `publishable` reemplaza a `anon` y
// `secret` a `service_role`. Aceptamos ambos nombres para que el proyecto
// funcione igual contra un Supabase en la nube (formato nuevo) que contra
// el stack local del CLI (formato viejo).
//
// Next.js reemplaza process.env.NEXT_PUBLIC_* en tiempo de compilación, así
// que hay que nombrar cada variable de forma literal: no se pueden leer con
// una variable intermedia.

export const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;

export const CLAVE_PUBLICA =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
