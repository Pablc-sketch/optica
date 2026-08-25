"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { guardarFotoProducto } from "@/lib/actions/inventario";

// Mismo patrón que subir-logo.tsx (configuracion/): la subida va desde el
// navegador (necesita el archivo real), y una vez subida se guarda la URL
// pública en productos.imagen_url vía server action.
export default function SubirFotoMarco({ tenantId, productoId }: { tenantId: string; productoId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function subir(archivo: File) {
    setSubiendo(true);
    setError(null);

    if (!archivo.type.startsWith("image/")) {
      setError("Tiene que ser una imagen (PNG o JPG).");
      setSubiendo(false);
      return;
    }
    if (archivo.size > 2 * 1024 * 1024) {
      setError("La imagen pesa demasiado (máximo 2 MB).");
      setSubiendo(false);
      return;
    }

    const extension = archivo.name.split(".").pop() || "jpg";
    const ruta = `${tenantId}/${productoId}.${extension}`;

    const supabase = createClient();

    // Mismo chequeo previo que subir-logo.tsx: si el navegador no tiene
    // sesión (o de otra óptica) al momento de subir, la política de
    // seguridad la rechaza sin más detalle que "row-level security policy".
    const { data: sesionData } = await supabase.auth.getSession();
    const token = sesionData.session?.access_token;
    if (!token) {
      setError("No hay una sesión activa en este navegador ahora mismo. Cierra sesión y vuelve a entrar.");
      setSubiendo(false);
      return;
    }

    const { error: subeError } = await supabase.storage
      .from("marcos")
      .upload(ruta, archivo, { upsert: true, cacheControl: "3600" });

    if (subeError) {
      setError(`No se pudo subir la imagen: ${subeError.message}`);
      setSubiendo(false);
      return;
    }

    const { data: urlPublica } = supabase.storage.from("marcos").getPublicUrl(ruta);
    const urlConVersion = `${urlPublica.publicUrl}?v=${Date.now()}`;

    const resultado = await guardarFotoProducto(productoId, urlConVersion);
    setSubiendo(false);
    if (resultado.ok) {
      setPreview(urlConVersion);
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
