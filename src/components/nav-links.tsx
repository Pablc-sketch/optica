"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Item = { href: string; label: string; principal?: boolean };

// Menú: lo de todos los días a la vista; lo de administración en "Más".
export default function NavLinks({ nav }: { nav: Item[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  // Al cambiar de pantalla se cierra el "Más".
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- cerrar el menú al navegar
    setAbierto(false);
  }, [pathname]);

  // El link más largo que calce gana (así "Buscar OT" no marca "Órdenes").
  const activoHref = nav
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname === i.href || pathname.startsWith(i.href + "/")))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const principales = nav.filter((i) => i.principal !== false && (i.principal || nav.length <= 8));
  const resto = nav.filter((i) => !principales.includes(i));
  const restoActivo = resto.some((i) => i.href === activoHref);

  const clase = (activo: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition ${
      activo ? "bg-white text-tinta shadow-sm" : "text-white/80 hover:bg-white/10 hover:text-white"
    }`;

  return (
    <div className="mx-auto max-w-5xl px-4 pb-2.5">
      <nav className="flex gap-1 overflow-x-auto">
        {principales.map((item) => (
          <Link key={item.href} href={item.href} className={clase(item.href === activoHref)}>
            {item.label}
          </Link>
        ))}
        {resto.length > 0 && (
          <button type="button" onClick={() => setAbierto((a) => !a)} className={clase(restoActivo || abierto)}>
            Más {abierto ? "▴" : "▾"}
          </button>
        )}
      </nav>
      {abierto && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-white/10 p-2 sm:grid-cols-4">
          {resto.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
                item.href === activoHref ? "bg-white text-tinta" : "bg-white/5 text-white hover:bg-white/15"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
