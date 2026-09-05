"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearProductosMasivo } from "@/lib/actions/inventario";

// Para cargar de una sola vez la lista de códigos de marco que llega del
// proveedor (una foto de un cuaderno, un PDF) — sin tener que abrir el
// formulario de "Nuevo producto" y llenarlo uno por uno para cada código.
// Cada línea pegada se convierte en un armazón propio, con ese código como
// nombre y como SKU; el costo/precio/marca se pueden completar después
// desde la lista de Stock si hace falta.
export default function NuevoProductoMasivo() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: number; repetidos: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accion(formData: FormData) {
    setGuardando(true);
    setError(null);
    setResultado(null);
    const r = await crearProductosMasivo(formData);
    setGuardando(false);
    if (r.ok) {
      setResultado({ creados: r.creados, repetidos: r.repetidos });
      setTexto("");
      router.refresh();
    } else {
      setError(r.error);
    }
  }

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Agregar códigos de marco (varios a la vez)</summary>
      <form action={accion} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Pega la lista de códigos, uno por línea
          <textarea
            name="codigos"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={8}
            placeholder={"TC1010C1\n522C1\nYS2438C4\n…"}
            className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 font-mono text-sm outline-none focus:border-brand"
          />
          <span className="text-xs font-normal text-tinta-suave">
            Cada línea queda como un armazón nuevo (con ese código de nombre y de SKU). Si un código ya
            existe, se salta solo — no se duplica.
          </span>
        </label>

        {error && <p className="text-sm font-medium text-red-700">{error}</p>}
        {resultado && (
          <p className="text-sm font-medium text-green-700">
            ✓ {resultado.creados} marco{resultado.creados === 1 ? "" : "s"} agregado
            {resultado.creados === 1 ? "" : "s"}
            {resultado.repetidos.length > 0 && (
              <> · Ya existían y se saltaron: {resultado.repetidos.join(", ")}</>
            )}
          </p>
        )}

        <div>
          <button
            disabled={guardando || !texto.trim()}
            className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {guardando ? "Agregando…" : "Agregar todos"}
          </button>
        </div>
      </form>
    </details>
  );
}
