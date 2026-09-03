import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/lib/actions/auth";
import EstadoSync from "@/components/estado-sync";
import NavLinks from "@/components/nav-links";
import { diasRestantes, estaVigente, type Suscripcion } from "@/lib/suscripcion";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/operativos", label: "Operativos" },
  { href: "/ot", label: "Órdenes" },
  { href: "/ot/buscar", label: "Buscar OT" },
  { href: "/ventas", label: "Ventas" },
  { href: "/laboratorio", label: "Laboratorio" },
  { href: "/inventario", label: "Inventario" },
  { href: "/reportes", label: "Reportes" },
  { href: "/precios", label: "Precios" },
  { href: "/configuracion", label: "Configuración" },
  { href: "/suscripcion", label: "Suscripción" },
];

// El rol "ventas" (vendedoras de mesón) solo necesita esto para atender:
// buscar/avanzar órdenes y vender. Nada de precios de costo, reportes
// financieros ni configuración.
const NAV_VENTAS = ["/ot", "/ot/buscar", "/ventas"];

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
      .select("nombre, rol, es_superadmin, tenants:tenant_id (nombre_comercial)")
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

  const nav = perfil.es_superadmin
    ? [...NAV, { href: "/superadmin", label: "Ópticas" }]
    : perfil.rol === "ventas"
      ? NAV.filter((n) => NAV_VENTAS.includes(n.href))
      : NAV;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-tinta-suave/15 bg-crema-claro/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            {logoOptica ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoOptica} alt="" width={36} height={36} className="h-9 w-9 rounded-xl object-contain" />
            ) : (
              <Image src="/logo.svg" alt="" width={36} height={36} className="rounded-xl" />
            )}
            <span className="leading-tight">
              <span className="block font-bold">{nombreOptica}</span>
              <span className="block text-[10px] font-medium uppercase tracking-wide text-tinta-suave">
                Lentia
              </span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <EstadoSync />
            <span className="hidden text-tinta-suave sm:inline">
              {perfil.nombre} · {perfil.rol}
            </span>
            <form action={cerrarSesion}>
              <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 font-medium transition hover:bg-crema">
                Salir
              </button>
            </form>
          </div>
        </div>
        <NavLinks nav={nav} />
      </header>

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

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
