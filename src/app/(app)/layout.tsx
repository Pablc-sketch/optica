import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/lib/actions/auth";
import EstadoSync from "@/components/estado-sync";
import { diasRestantes, estaVigente, type Suscripcion } from "@/lib/suscripcion";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/ot", label: "Órdenes" },
  { href: "/ventas", label: "Ventas" },
  { href: "/laboratorio", label: "Laboratorio" },
  { href: "/inventario", label: "Inventario" },
  { href: "/reportes", label: "Reportes" },
  { href: "/boleta", label: "Boleta" },
  { href: "/precios", label: "Precios" },
  { href: "/configuracion", label: "Configuración" },
  { href: "/suscripcion", label: "Suscripción" },
];

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

  const [perfilRes, suscripcionRes] = await Promise.all([
    supabase
      .from("users")
      .select("nombre, rol, es_superadmin, tenants:tenant_id (nombre_comercial)")
      .eq("id", user.id)
      .single(),
    supabase
      .from("suscripciones")
      .select("plan, estado, fecha_inicio, fecha_renovacion, medio_pago")
      .maybeSingle(),
  ]);

  const perfil = perfilRes.data;
  const suscripcion = suscripcionRes.data as Suscripcion | null;

  // Sin perfil el usuario existe en Auth pero no completó el registro de
  // su óptica (por ejemplo, si se cortó a mitad del alta).
  if (!perfil) redirect("/registro");

  const nombreOptica =
    (perfil.tenants as unknown as { nombre_comercial: string } | null)?.nombre_comercial ?? "Óptica";

  const vigente = estaVigente(suscripcion);
  const dias = suscripcion ? diasRestantes(suscripcion.fecha_renovacion) : null;
  const porVencer = vigente && dias !== null && dias <= 7;

  const nav = perfil.es_superadmin
    ? [...NAV, { href: "/superadmin", label: "Ópticas" }]
    : NAV;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-tinta-suave/15 bg-crema-claro/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={36} height={36} className="rounded-xl" />
            <span className="font-bold leading-tight">{nombreOptica}</span>
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
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema hover:text-tinta"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

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
