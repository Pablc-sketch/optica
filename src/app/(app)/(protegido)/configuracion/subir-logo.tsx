"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { guardarLogoOptica } from "@/lib/actions/configuracion";

// La subida a Storage se hace desde el navegador (necesita el archivo real,
// no algo que pase por un campo de formulario de texto); una vez subido, se
// guarda la URL pública en tenants.logo_url con una server action normal.
export default function SubirLogo({ tenantId, logoActual }: { tenantId: string; logoActual: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(logoActual);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("Tiene que ser una imagen (PNG, JPG o SVG).");
      setSubiendo(false);
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      setError("La imagen pesa demasiado (máximo 2 MB).");
      setSubiendo(false);
      return;
    }

    const extension = archivo.name.split(".").pop() || "png";
    const ruta = `${tenantId}/logo.${extension}`;

    const supabase = createClient();
    const { error: subeError } = await supabase.storage
      .from("logos")
      .upload(ruta, archivo, { upsert: true, cacheControl: "3600" });

    if (subeError) {
      // El mensaje real de Supabase (bucket inexistente, política de RLS
      // que no matchea, etc.) es mucho más útil para diagnosticar que un
      // genérico "no se pudo".
      setError(`No se pudo subir la imagen: ${subeError.message}`);
      setSubiendo(false);
      return;
    }

    const { data: urlPublica } = supabase.storage.from("logos").getPublicUrl(ruta);
    // Cache-bust: mismo nombre de archivo si se reemplaza el logo, así que
    // sin esto el navegador seguiría mostrando la imagen vieja.
    const urlConVersion = `${urlPublica.publicUrl}?v=${Date.now()}`;

    const resultado = await guardarLogoOptica(urlConVersion);
    setSubiendo(false);
    if (resultado.ok) {
      setPreview(urlConVersion);
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
