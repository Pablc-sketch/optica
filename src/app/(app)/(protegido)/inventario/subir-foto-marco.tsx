"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { subirFotoProducto } from "@/lib/actions/inventario";

// El archivo se manda al servidor (subirFotoProducto) y se sube ahí con
// permisos de administrador, no desde el navegador — ver el comentario en
// esa función.
export default function SubirFotoMarco({ productoId }: { productoId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);

    const formData = new FormData();
    formData.set("producto_id", productoId);
    formData.set("archivo", archivo);

    const resultado = await subirFotoProducto(formData);
    setSubiendo(false);
    if (resultado.ok) {
      setPreview(resultado.url);
      router.refresh();
    } else {
      setError(resultado.error);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-10 w-10 rounded-lg object-cover" />
      )}
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
        className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium text-tinta-suave transition hover:bg-crema disabled:opacity-60"
      >
        {subiendo ? "Subiendo…" : preview ? "Cambiar foto" : "📷 Agregar foto"}
      </button>
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
    </div>
  );
}
