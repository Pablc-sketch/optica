"use client";

import { useRef, useState } from "react";
import { cargarStockMarcos } from "@/lib/actions/inventario";
import { leerCargaMarcos, type ModoCargaMarcos } from "@/lib/carga-marcos";

export default function NuevoProductoMasivo({ sucursalId }: { sucursalId: string }) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<ModoCargaMarcos>("entrada");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");
  const solicitud = useRef<{ id: string; modo: ModoCargaMarcos; texto: string } | null>(null);
  const { filas, error: errorLista } = leerCargaMarcos(texto, modo);
  const unidades = filas.reduce((total, fila) => total + fila.cantidad, 0);

  async function guardar(formData: FormData) {
    if (guardando || errorLista || !filas.length) return;
    if (!solicitud.current || solicitud.current.modo !== modo || solicitud.current.texto !== texto) {
      solicitud.current = { id: crypto.randomUUID(), modo, texto };
    }
    setGuardando(true);
    setError("");
    setMensaje("");
    formData.set("id", solicitud.current.id);
    try {
      const r = await cargarStockMarcos(formData);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const { codigos, unidades, creados } = r.resultado;
      setMensaje(modo === "entrada"
        ? `Entrada guardada · ${unidades} unidades · ${codigos} códigos (${creados} nuevos)`
        : `Conteo guardado · ${unidades} unidades en ${codigos} códigos (${creados} nuevos)`);
      setTexto("");
      solicitud.current = null;
    } catch {
      setError("No se pudo confirmar la carga. Deja la misma lista y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <details className="rounded-2xl border border-brand/20 bg-white p-4 shadow-sm">
      <summary className="cursor-pointer font-bold text-brand-dark">+ Cargar marcos por código</summary>
      <form action={guardar} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="sucursal_id" value={sucursalId} />
        <fieldset disabled={guardando} className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Tipo de carga</legend>
          {([["entrada", "Sumar unidades"], ["conteo", "Conteo físico"]] as const).map(([id, nombre]) => (
            <label key={id} className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${modo === id ? "border-brand bg-brand/10" : "border-tinta/15"}`}>
              <input type="radio" name="modo" value={id} checked={modo === id} onChange={() => {
                setModo(id);
                setMensaje("");
                setError("");
              }} />
              {nombre}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1 text-sm font-semibold">
          Código de la etiqueta y cantidad
          <textarea
            name="codigos" value={texto} onChange={e => { setTexto(e.target.value); setMensaje(""); setError(""); }}
            rows={5} maxLength={30_000} readOnly={guardando} spellCheck={false} autoCapitalize="characters"
            placeholder={"LY-2187L C-2; 3\n522C1; 1"}
            className="rounded-xl border border-tinta/20 bg-white px-3 py-2.5 font-mono text-base"
          />
        </label>
        <p className="text-sm text-tinta-suave">
          {modo === "entrada" ? "Un código por línea. Sin cantidad, suma una unidad. También puedes pegar dos columnas desde Excel."
            : "Pega el código y las unidades que contaste, separados por punto y coma. Se ajustan solo los códigos de la lista."}
        </p>
        {errorLista && <p role="status" className="text-sm font-medium text-red-700">{errorLista}</p>}
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        {mensaje && <p role="status" className="text-sm font-semibold text-emerald-800">{mensaje}</p>}
        {filas.length > 0 && <p className="text-sm font-semibold">{filas.length} códigos · {unidades} unidades</p>}
        <button disabled={guardando || !!errorLista || !filas.length} className="self-start rounded-xl bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-50">
          {guardando ? "Guardando…" : modo === "entrada" ? "Guardar entrada" : "Confirmar conteo"}
        </button>
      </form>
    </details>
  );
}
