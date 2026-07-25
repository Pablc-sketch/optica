import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { cerrarSesion } from "@/lib/actions/auth";

const NAV = [
  { href: "/", label: "Inicio" },
  { href: "/pacientes", label: "Pacientes" },
  { href: "/ot", label: "Órdenes" },
  { href: "/ventas", label: "Ventas" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("users")
    .select("nombre, rol, tenants:tenant_id (nombre_comercial)")
    .eq("id", user.id)
    .single();

  const nombreOptica =
    (perfil?.tenants as unknown as { nombre_comercial: string } | null)?.nombre_comercial ?? "Óptica";

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-tinta-suave/15 bg-crema-claro/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.svg" alt="" width={36} height={36} className="rounded-xl" />
            <span className="font-bold leading-tight">{nombreOptica}</span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-tinta-suave sm:inline">
              {perfil?.nombre} · {perfil?.rol}
            </span>
            <form action={cerrarSesion}>
              <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 font-medium transition hover:bg-crema">
                Salir
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
          {NAV.map((item) => (
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
