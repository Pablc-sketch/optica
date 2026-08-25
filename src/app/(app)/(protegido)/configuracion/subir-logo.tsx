"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirLogoOptica } from "@/lib/actions/configuracion";

// El archivo se manda al servidor (subirLogoOptica) y se sube ahí con
// permisos de administrador, no desde el navegador — ver el comentario en
// esa función para la razón.
export default function SubirLogo({ logoActual }: { logoActual: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(logoActual);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);

    const formData = new FormData();
    formData.set("archivo", archivo);

    const resultado = await subirLogoOptica(formData);
    setSubiendo(false);
    if (resultado.ok) {
      setPreview(resultado.url);
      router.refresh();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <div className="flex items-center gap-4 rounded-2xl bg-crema-claro p-4 shadow-sm">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white">
        {preview ? (
          // Logo subido por la óptica: viene de una URL externa (Storage),
          // no de los assets propios del proyecto.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Logo de la óptica" className="h-full w-full object-contain" />
        ) : (
          <span className="text-xs text-tinta-suave">Sin logo</span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Logo de la óptica</p>
        <p className="text-xs text-tinta-suave">
          Aparece en el menú y en los documentos impresos (receta, comprobante, orden de trabajo).
          PNG o JPG, máximo 2 MB.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) subir(archivo);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="mt-1 w-fit rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white disabled:opacity-60"
        >
          {subiendo ? "Subiendo…" : preview ? "Cambiar logo" : "Subir logo"}
        </button>
        {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      </div>
    </div>
  );
}
