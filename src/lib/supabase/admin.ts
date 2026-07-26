import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente con service role: SALTA todas las policies de RLS. Solo puede
// usarse dentro de Server Actions y siempre después de verificar a mano
// quién llama y a qué óptica pertenece (ver requerirAdmin en
// src/lib/actions/configuracion.ts).
//
// El import de "server-only" hace que el build falle si algún día alguien
// importa este archivo desde un Client Component: la clave nunca puede
// terminar en el navegador.
export function createAdminClient() {
  // `secret` es el nombre nuevo de Supabase; `service_role`, el anterior.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SECRET_KEY en .env.local. Sin esa clave no se pueden crear usuarios."
    );
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
