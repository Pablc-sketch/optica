import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Cliente para Server Components / Route Handlers / Server Actions.
// El tenant_id efectivo de cada request sale del JWT validado en esta
// sesión de servidor (via el custom access token hook), nunca de un
// parámetro que mande el cliente.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
