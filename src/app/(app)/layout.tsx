import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/lib/actions/auth";
import EstadoSync from "@/components/estado-sync";
import Icono from "@/components/icono";
import NavLinks from "@/components/nav-links";
import BarraCarga from "@/components/barra-carga";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { menuParaRol } from "@/lib/navegacion";
import { mercadoPagoConfigurado } from "@/lib/mercadopago-sync";
import { diasRestantes, estaVigente, type Suscripcion } from "@/lib/suscripcion";

// Cabecera y menú: siempre visibles para cualquier pantalla dentro de
// (app), incluida /suscripcion. El bloqueo por suscripción vencida vive
// en el layout anidado (protegido), no acá — si viviera acá, /suscripcion
// quedaría atrapada mostrando el aviso de "vencida" en vez de la pantalla
// para renovar.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [perfilRes, suscripcionRes, rolTokenRes, logoRes] = await Promise.all([
    supabase
      .from("users")
      .select("tenant_id, nombre, rol, estado, es_superadmin, tenants:tenant_id (nombre_comercial)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("suscripciones")
      .select("plan, estado, fecha_inicio, fecha_renovacion, medio_pago")
      .maybeSingle(),
    // El rol que efectivamente lleva la sesión. RLS decide con este valor
    // (viene del JWT, puesto por el auth hook al iniciar sesión), no con el
    // de la tabla users.
    supabase.rpc("jwt_rol"),
    // Aparte de la consulta principal: si logo_url todavía no existe en esta
    // base (migración pendiente), que falle sola sin tumbar el layout entero.
    supabase.from("tenants").select("logo_url").single(),
  ]);

  const perfil = perfilRes.data;
  const suscripcion = suscripcionRes.data as Suscripcion | null;

  // Sin perfil el usuario existe en Auth pero no completó el registro de
  // su óptica (por ejemplo, si se cortó a mitad del alta).
  if (!perfil) redirect("/registro");

  // Cuenta desactivada: la base ya le cierra todos los datos (A01); acá se
  // le dice qué pasó en vez de mostrarle pantallas vacías.
  if (perfil.estado !== "activo") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl bg-crema-claro p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold">Tu cuenta está desactivada</h1>
        <p className="mt-2 text-sm text-tinta-suave">
          El administrador de la óptica desactivó esta cuenta. Si crees que es un error, pídele que la vuelva a
          activar desde Configuración.
        </p>
        <form action={cerrarSesion} className="mt-4">
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
            Cerrar sesión
          </button>
        </form>
      </div>
    );
  }

  const nombreOptica =
    (perfil.tenants as unknown as { nombre_comercial: string } | null)?.nombre_comercial ?? "Óptica";
  const logoOptica = logoRes.data?.logo_url ?? null;

  // Al cambiar el rol de alguien, la tabla se actualiza al instante pero su
  // sesión sigue con el rol anterior hasta que vuelve a entrar. Eso deja a
  // la persona viendo "admin" en la cabecera mientras la base le rechaza
  // todo, sin ninguna pista de por qué. Se detecta y se le dice qué hacer.
  const rolToken = (rolTokenRes.data as string | null) ?? "";
  const sesionDesactualizada = !rolTokenRes.error && rolToken !== perfil.rol;

  const vigente = estaVigente(suscripcion);
  const dias = suscripcion ? diasRestantes(suscripcion.fecha_renovacion) : null;
  const porVencer = vigente && dias !== null && dias <= 7;

  const nav = menuParaRol(perfil.rol, mercadoPagoConfigurado(perfil.tenant_id), perfil.es_superadmin);
  if (esPilotoTerreno(perfil.tenant_id) && perfil.rol === "admin") {
    const i = nav.findIndex(n=>n.href === "/operativos");
    if (i >= 0) nav[i] = {href:"/agenda/equipos",label:"Agenda",principal:true,movil:true};
  }

  return (
    <div className="app-marco min-h-dvh lg:grid lg:grid-cols-[13.25rem_minmax(0,1fr)]">
      <BarraCarga />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:text-tinta">Ir al contenido</a>
      <header className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-sidebar px-3 pb-1.5 pt-2 text-white sm:px-4 lg:flex lg:h-dvh lg:flex-col lg:items-stretch lg:gap-5 lg:overflow-y-auto lg:overscroll-contain lg:pb-4 lg:pt-5 print:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 lg:px-1">
            {logoOptica ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoOptica} alt="" width={36} height={36} className="h-9 w-9 rounded-xl bg-white object-contain p-0.5" />
            ) : (
              <Image src="/logo.svg" alt="" width={36} height={36} className="rounded-xl bg-white p-0.5" />
            )}
            <span className="min-w-0 leading-tight">
              <span className="block text-base font-bold tracking-tight">Lentia</span>
              <span className="block truncate text-xs font-medium text-sidebar-text" title={nombreOptica}>{nombreOptica}</span>
            </span>
          </Link>
          <div className="flex min-w-0 items-center gap-2 lg:order-last lg:mt-auto lg:justify-between lg:border-t lg:border-white/15 lg:pt-4">
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-xs font-semibold" title={perfil.nombre}>{perfil.nombre}</p>
              <p className="text-xs capitalize text-sidebar-text">{perfil.rol}</p>
            </div>
            <form action={cerrarSesion}>
              <button aria-label="Cerrar sesión" title="Cerrar sesión" className="flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-2 text-xs font-medium hover:bg-white/10">
                <Icono nombre="salir" className="size-4" /> <span className="lg:sr-only">Salir</span>
              </button>
            </form>
          </div>
        <div className="col-span-2 lg:shrink-0"><NavLinks nav={nav} /></div>
      </header>

      <div className="min-w-0">
      <div className="relative z-[9] mx-auto flex max-w-7xl justify-end px-3 pt-2 empty:hidden sm:px-6 lg:px-8 print:hidden">
        <EstadoSync usuarioId={user.id} />
      </div>
      {sesionDesactualizada && (
        <div className="border-b border-amber-300 bg-amber-100 px-4 py-3 text-center text-sm text-amber-900 print:hidden">
          Tu rol cambió a <b>{perfil.rol}</b>, pero esta sesión sigue con los permisos de{" "}
          <b>{rolToken || "antes"}</b>. Cierra sesión y vuelve a entrar para aplicarlo.{" "}
          <form action={cerrarSesion} className="mt-2 inline-block sm:mt-0">
            <button className="rounded-lg bg-amber-900 px-3 py-1.5 font-semibold text-white transition hover:bg-amber-800">
              Cerrar sesión y volver a entrar
            </button>
          </form>
        </div>
      )}

      {porVencer && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 print:hidden">
          {suscripcion!.estado === "trial" ? "Tu prueba gratuita" : "Tu suscripción"} vence en{" "}
          <b>{dias === 0 ? "menos de un día" : `${dias} día${dias === 1 ? "" : "s"}`}</b>.{" "}
          <Link href="/suscripcion" className="font-semibold underline">
            Ver planes
          </Link>
        </div>
      )}

      <main id="contenido" tabIndex={-1} className="mx-auto w-full max-w-7xl px-3 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8 print:max-w-none print:p-0">
        {children}
      </main>
      </div>
    </div>
  );
}
