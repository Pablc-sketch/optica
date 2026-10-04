"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Antes ningún link del menú marcaba en qué pantalla estabas parado — solo
// el hover al pasar el mouse. Necesita usePathname(), así que es la única
// parte del encabezado que tiene que ser de cliente.
export default function NavLinks({ nav }: { nav: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2.5">
      {nav.map((item) => {
        const activo = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition ${
              activo ? "bg-white text-tinta shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
