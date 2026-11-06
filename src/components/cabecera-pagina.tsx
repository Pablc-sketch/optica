import type { ReactNode } from "react";

export default function CabeceraPagina({ seccion, titulo, acciones }: {
  seccion: string;
  titulo: string;
  acciones?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent-dark">{seccion}</p>
        <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{titulo}</h1>
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}
