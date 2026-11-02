'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { enlaceActivo, type EnlaceMenu } from '@/lib/navegacion';
export default function NavLinks({ nav }: { nav: EnlaceMenu[] }) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const cerrarFuera = (e: PointerEvent) => { if (!contenedor.current?.contains(e.target as Node)) setAbierto(false); };
    const cerrarEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    document.addEventListener('pointerdown', cerrarFuera);
    document.addEventListener('keydown', cerrarEscape);
    return () => { document.removeEventListener('pointerdown', cerrarFuera); document.removeEventListener('keydown', cerrarEscape); };
  }, [abierto]);
  const activo = enlaceActivo(nav, pathname);
  const principales = nav.filter(n => n.principal);
  const resto = nav.filter(n => !n.principal || !n.movil);
  const clase = (marcado: boolean) => `rounded-full px-2.5 py-2 text-sm font-semibold ${marcado ? 'bg-white text-tinta shadow-sm' : 'text-white/85 hover:bg-white/10 hover:text-white'}`;
  return <div ref={contenedor} className="mx-auto max-w-5xl px-4 pb-2.5">
    <nav aria-label="Menú principal" className="flex flex-wrap items-center gap-0.5">
      {principales.map(n => <Link key={n.href} href={n.href} onClick={() => setAbierto(false)} aria-current={activo === n.href ? 'page' : undefined}
        className={`${n.movil ? '' : 'hidden sm:inline-block'} ${clase(activo === n.href)}`}>{n.label}</Link>)}
      {resto.length > 0 && <button ref={boton} type="button" aria-expanded={abierto} aria-controls="menu-mas"
        onClick={() => setAbierto(a => !a)} className={clase(abierto || (activo !== undefined && !principales.some(n => n.href === activo)))}>
        Más <span aria-hidden>{abierto ? '▴' : '▾'}</span>
      </button>}
    </nav>
    {abierto && <nav id="menu-mas" aria-label="Más opciones" className="mt-2 grid grid-cols-2 gap-1.5 rounded-2xl bg-white/10 p-2 sm:grid-cols-3">
      {resto.map(n => <Link key={n.href} href={n.href} onClick={() => setAbierto(false)} aria-current={activo === n.href ? 'page' : undefined}
        className={`${n.principal ? 'sm:hidden' : ''} rounded-xl px-3 py-2.5 text-sm font-semibold ${activo === n.href ? 'bg-white text-tinta' : 'bg-white/5 text-white hover:bg-white/15'}`}>{n.label}</Link>)}
    </nav>}
  </div>;
}
