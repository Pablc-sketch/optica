"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Icono, { type NombreIcono } from "@/components/icono";
import { enlaceActivo, type EnlaceMenu } from "@/lib/navegacion";

const grupos: { titulo: string; enlaces: Record<string, NombreIcono> }[] = [
  { titulo: "Operación", enlaces: { "/": "inicio", "/ventas": "venta", "/cobros": "cobros", "/entregas": "entregas", "/caja": "caja", "/seguros": "reembolsos" } },
  { titulo: "Atención", enlaces: { "/pacientes": "pacientes", "/operativos/agenda": "agenda", "/agenda/equipos": "agenda", "/operativos": "agenda", "/ot": "ordenes" } },
  { titulo: "Administración", enlaces: { "/inventario": "inventario", "/laboratorio": "laboratorio", "/configuracion": "configuracion", "/superadmin": "opticas" } },
];
const iconos = Object.assign({}, ...grupos.map(g => g.enlaces)) as Record<string, NombreIcono>;
const link = "flex min-h-10 items-center rounded-lg py-2 font-medium text-sidebar-text hover:bg-white/10 hover:text-white aria-[current=page]:bg-sidebar-active aria-[current=page]:font-semibold aria-[current=page]:text-white";
const lateral = link + " gap-2.5 px-3 text-sm";
const compacto = link + " gap-1 px-2 text-xs sm:gap-2 sm:px-3 sm:text-sm";

export default function NavLinks({ nav }: { nav: EnlaceMenu[] }) {
  const pathname = usePathname();
  const activo = enlaceActivo(nav, pathname);
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: PointerEvent) => { if (!contenedor.current?.contains(e.target as Node)) setAbierto(false); };
    const cerrarEscape = (e: KeyboardEvent) => { if (e.key === "Escape") { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener("pointerdown", cerrarFuera);
    document.addEventListener("keydown", cerrarEscape);
    return () => {
      document.removeEventListener("pointerdown", cerrarFuera);
      document.removeEventListener("keydown", cerrarEscape);
    };
  }, [abierto]);

  const accesos = nav.filter(n => n.movil);
  const resto = nav.filter(n => !n.movil);
  const renderEnlace = (n: EnlaceMenu, clase: string) => (
    <Link key={n.href} href={n.href} onClick={() => setAbierto(false)}
      aria-current={activo === n.href ? "page" : undefined} className={clase}>
      <Icono nombre={iconos[n.href] ?? "mas"} className="size-4 shrink-0" />
      {n.label}
    </Link>
  );
  return (
    <>
      <nav aria-label="Menú principal" className="hidden space-y-4 lg:block">
        {grupos.map(g => {
          const enlaces = nav.filter(n => Object.hasOwn(g.enlaces, n.href));
          if (!enlaces.length) return null;
          return (
            <div key={g.titulo} className="space-y-0.5">
              <p className="mb-1.5 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-sidebar-muted">{g.titulo}</p>
              {enlaces.map(n => renderEnlace(n, lateral))}
            </div>
          );
        })}
      </nav>
      <div ref={contenedor} className="relative lg:hidden">
        <nav aria-label="Accesos principales" className="flex flex-wrap items-center gap-0.5">
          {accesos.map(n => renderEnlace(n, compacto))}
          {resto.length > 0 && (
            <button ref={boton} type="button" aria-expanded={abierto} aria-controls="menu-mas"
              onClick={() => setAbierto(a => !a)}
              className={compacto + (abierto || resto.some(n => n.href === activo) ? " bg-sidebar-active text-white" : "")}>
              <Icono nombre="mas" className="size-4 shrink-0" /> Más
            </button>
          )}
        </nav>
        {abierto && (
          <nav id="menu-mas" aria-label="Más opciones" className="absolute inset-x-0 top-full z-20 mt-2 grid max-h-[60dvh] grid-cols-2 gap-1 overflow-auto rounded-xl border border-white/15 bg-sidebar p-2 shadow-lg sm:grid-cols-3">
            {resto.map(n => renderEnlace(n, lateral))}
          </nav>
        )}
      </div>
    </>
  );
}
