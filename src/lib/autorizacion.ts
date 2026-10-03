import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Rol = "admin" | "clinico" | "ventas" | "bodega";

export class SinPermiso extends Error {}

// Toda acción que toca datos pasa por acá. La óptica y el rol salen de la
// BASE, no del formulario ni del token: así una cuenta desactivada, o a la
// que le cambiaron el rol, queda fuera desde la próxima acción y no cuando
// vence su sesión (hallazgo A01). Lo mismo hace la base por su cuenta con
// RLS; esto es para dar un mensaje claro y, sobre todo, para cuidar las
// acciones que usan la llave de servicio, que RLS no revisa (A08).
export async function requerirPerfil(opciones?: { roles?: Rol[]; suscripcion?: boolean }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("users")
    .select("tenant_id, rol, estado")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil || perfil.estado !== "activo") {
    throw new SinPermiso("Tu cuenta está desactivada. Pídele al administrador de la óptica que la reactive.");
  }
  const rol = perfil.rol as Rol;
  if (opciones?.roles && !opciones.roles.includes(rol)) {
    throw new SinPermiso("Tu rol no tiene permiso para hacer esto.");
  }
  if (opciones?.suscripcion) {
    const { data: vigente } = await supabase.rpc("suscripcion_vigente");
    if (vigente === false) throw new SinPermiso("La suscripción de la óptica venció.");
  }
  return { supabase, user, tenantId: perfil.tenant_id as string, rol };
}

// Para páginas: si el rol no corresponde, se vuelve al inicio en vez de
// mostrar la pantalla. Esconder el link del menú no basta — la página se
// puede abrir escribiendo la dirección (A09).
export async function exigirRolPagina(roles: Rol[]) {
  try {
    return await requerirPerfil({ roles });
  } catch (e) {
    if (e instanceof SinPermiso) redirect("/");
    throw e;
  }
}
