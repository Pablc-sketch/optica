"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { actualizarFichaMarco, agregarMarcoAlInventario } from "@/lib/actions/inventario";

type Datos = { id: string; marca: string | null; material: string | null; color: string | null };
type Proveedor = { id: string; nombre: string };
const campo = "min-w-0 rounded-lg border border-tinta/20 bg-white px-3 py-2 text-base";

export default function FichaMarco({ sucursalId, proveedores = [], datos }: {
  sucursalId?: string;
  proveedores?: Proveedor[];
  datos?: Datos;
}) {
  const router = useRouter();
  const solicitud = useRef<string | null>(null);
  const ocupado = useRef(false);
  const [guardando, setGuardando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (ocupado.current) return;
    const formulario = evento.currentTarget;
    const valores = new FormData(formulario);
    ocupado.current = true;
    setGuardando(true);
    setResultado(null);
    try {
      if (!datos) {
        solicitud.current ??= crypto.randomUUID();
        valores.set("id", solicitud.current);
      }
      const res = datos ? await actualizarFichaMarco(valores) : await agregarMarcoAlInventario(valores);
      if (!res.ok) {
        setResultado({ ok: false, texto: res.error });
        return;
      }
      if (!datos) {
        solicitud.current = null;
        formulario.reset();
        formulario.querySelector<HTMLInputElement>('input[name="codigo"]')?.focus();
      }
      setResultado({ ok: true, texto: datos ? "Ficha guardada" : "Marco registrado" });
      router.refresh();
    } catch {
      setResultado({ ok: false, texto: "No se pudo comprobar el guardado. Intenta de nuevo." });
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  return <form onSubmit={guardar} className="space-y-3">
    {datos ? <input type="hidden" name="producto_id" value={datos.id} /> : <>
      <input type="hidden" name="sucursal_id" value={sucursalId} />
      <div className="flex flex-wrap gap-2">
        <label className="grid min-w-40 flex-1 gap-1 text-sm font-semibold">
          Código de la patilla
          <input name="codigo" required maxLength={80} placeholder="Ej. AB123" autoCapitalize="characters" spellCheck={false} className={campo} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Código color <span className="sr-only">opcional</span>
          <input name="codigo_color" maxLength={24} placeholder="C1" autoCapitalize="characters" className={`${campo} w-28`} />
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          Unidades
          <input name="cantidad" type="number" required min={0} step={1} inputMode="numeric" defaultValue={1} className={`${campo} w-24 tabular-nums`} />
        </label>
      </div>
    </>}
    <div className="grid gap-2 sm:grid-cols-3">
      <label className="grid gap-1 text-sm font-medium">
        Marca
        <input name="marca" defaultValue={datos?.marca ?? ""} maxLength={80} placeholder="Opcional" className={campo} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Material
        <input name="material" defaultValue={datos?.material ?? ""} maxLength={80} placeholder="Ej. Acetato" className={campo} />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Color
        <input name="color" defaultValue={datos?.color ?? ""} maxLength={80} placeholder="Ej. Negro" className={campo} />
      </label>
    </div>
    {!datos && proveedores.length > 0 && <label className="grid max-w-xs gap-1 text-sm font-medium">
      Proveedor
      <select name="proveedor_id" className={campo}>
        <option value="">Sin especificar</option>
        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
    </label>}
    <div className="flex flex-wrap items-center gap-3">
      <button disabled={guardando} className="rounded-lg bg-sidebar px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {guardando ? "Guardando…" : datos ? "Guardar ficha" : "Guardar marco"}
      </button>
      {resultado && <p role="status" className={`text-sm font-medium ${resultado.ok ? "text-emerald-800" : "text-red-700"}`}>{resultado.texto}</p>}
    </div>
  </form>;
}
