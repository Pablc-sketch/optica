import { createBrowserClient } from "@supabase/ssr";
import { CLAVE_PUBLICA, URL_SUPABASE } from "./config";

// Cliente para Client Components. @supabase/ssr guarda la sesión en cookies
// httpOnly/secure (gestionadas por el proxy), nunca en localStorage —
// requisito de seguridad de la spec (sección 8.1).
export function createClient() {
  return createBrowserClient(URL_SUPABASE, CLAVE_PUBLICA);
}
