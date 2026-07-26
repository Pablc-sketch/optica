import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { CLAVE_PUBLICA, URL_SUPABASE } from "./config";

// Cliente para Server Components / Route Handlers / Server Actions.
// El tenant_id efectivo de cada request sale del JWT validado en esta
// sesión de servidor (via el custom access token hook), nunca de un
// parámetro que mande el cliente.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    URL_SUPABASE,
    CLAVE_PUBLICA,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll llamado desde un Server Component: se ignora porque
            // el middleware ya se encarga de refrescar la sesión.
          }
        },
      },
    }
  );
}
