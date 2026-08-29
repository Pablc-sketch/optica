"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Antes ningún link del menú marcaba en qué pantalla estabas parado — solo
// el hover al pasar el mouse. Necesita usePathname(), así que es la única
// parte del encabezado que tiene que ser de cliente.
export default function NavLinks({ nav }: { nav: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
      {nav.map((item) => {
        const activo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              activo ? "bg-brand text-white" : "text-tinta-suave hover:bg-crema hover:text-tinta"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
