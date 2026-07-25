import { createBrowserClient } from "@supabase/ssr";

// Cliente para Client Components. @supabase/ssr guarda la sesión en cookies
// httpOnly/secure (gestionadas por el middleware), nunca en localStorage —
// requisito de seguridad de la spec (sección 8.1).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
