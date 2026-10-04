"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Barra fina arriba de la pantalla mientras carga la página siguiente. Con
// la app lenta, tocar un link no mostraba nada y parecía que no había
// respondido (y se volvía a tocar). Arranca al tocar un link interno y se
// apaga cuando cambia la dirección.
function Barra() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [activa, setActiva] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la navegación terminó: se apaga la barra
    setActiva(false);
  }, [pathname, params]);

  useEffect(() => {
    function alTocar(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setActiva(true);
    }
    document.addEventListener("click", alTocar, true);
    return () => document.removeEventListener("click", alTocar, true);
  }, []);

  // Por si una navegación no llega a cambiar la dirección (error, redirect
  // a la misma página): no dejarla prendida para siempre.
  useEffect(() => {
    if (!activa) return;
    const t = setTimeout(() => setActiva(false), 15000);
    return () => clearTimeout(t);
  }, [activa]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-1 overflow-hidden transition-opacity duration-200 print:hidden ${
        activa ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="barra-carga h-full w-1/3 rounded-full bg-brand-light" />
    </div>
  );
}

export default function BarraCarga() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
