import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { CLAVE_PUBLICA, URL_SUPABASE } from "@/lib/supabase/config";
import { COOKIE_ACTIVIDAD, hayQueRefrescar, HORAS_INACTIVIDAD, leerActividad, sesionVencida } from "@/lib/sesion-actividad";

// Next 16: proxy.ts reemplaza a middleware.ts. Refresca el access token
// (~15 min de vida, spec 8.1) y protege todas las rutas de la app:
// sin sesión → /login.
export async function proxy(request: NextRequest) {
  // Tarjeta pública de marca: solo logo y eslogan, sin datos de pacientes.
  const rutaMarca = request.nextUrl.pathname;
  if (rutaMarca === "/optica-global" || rutaMarca === "/optica-global/opengraph-image") {
    return NextResponse.next();
  }
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    URL_SUPABASE,
    CLAVE_PUBLICA,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Dispara el refresh de la sesión si el access token expiró.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /registro es pública: quien la abre todavía no tiene cuenta.
  const ruta = request.nextUrl.pathname;
  const esPublica = ruta.startsWith("/login") || ruta.startsWith("/registro");

  // Al redirigir hay que llevar las cookies que el refresco de sesión dejó
  // en `response` (token renovado, o borrado si el refresh token ya no
  // sirve). Sin esto la redirección salía sin ellas: el navegador seguía
  // mandando el token viejo y la sesión quedaba en un estado roto
  // (refresh_token_not_found en los logs) (A13).
  const redirigir = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const destino = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => destino.cookies.set(c));
    return destino;
  };

  // Candado por inactividad: pasadas HORAS_INACTIVIDAD sin usar la app se
  // cierra la sesión (aunque la cookie siga ahí) y se pide clave de nuevo.
  const ahora = Date.now();
  const ultimo = leerActividad(request.cookies.get(COOKIE_ACTIVIDAD)?.value);
  if (user && sesionVencida(ultimo, ahora)) {
    await supabase.auth.signOut();
    const destino = redirigir("/login");
    destino.cookies.delete(COOKIE_ACTIVIDAD);
    return destino;
  }
  if (user && hayQueRefrescar(ultimo, ahora)) {
    response.cookies.set(COOKIE_ACTIVIDAD, String(ahora), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: HORAS_INACTIVIDAD * 3600 * 4,
    });
  }

  // Sin sesión no debe quedar una marca vieja: al ingresar de nuevo
  // se vencería al tiro.
  if (!user && request.cookies.has(COOKIE_ACTIVIDAD)) response.cookies.delete(COOKIE_ACTIVIDAD);

  if (!user && !esPublica) return redirigir("/login");
  if (user && ruta.startsWith("/login")) return redirigir("/");

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
