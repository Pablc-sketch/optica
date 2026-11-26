"use client";

import { useActionState, useState } from "react";
import { guardarMarcoManual, type EstadoCompraMarcos } from "@/lib/actions/compra-marcos";

export type MarcoManual = {
  id: string;
  codigo: string;
  proveedor: string;
  cantidad: number;
  comprado: boolean;
};

const estadoInicial: EstadoCompraMarcos = { ok: false, mensaje: "" };
const campo = "rounded-lg border bg-white px-2.5 py-2 text-base";
const boton = "min-h-10 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50";

export default function AgregarMarco({ fila, proveedores = [] }: { fila?: MarcoManual; proveedores?: string[] }) {
  const [codigo, setCodigo] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [cantidad, setCantidad] = useState(String(fila?.cantidad ?? 1));
  const [comprado, setComprado] = useState(fila?.comprado ?? false);
  const [estado, guardar, enviando] = useActionState(async (anterior: EstadoCompraMarcos, form: FormData) => {
    const resultado = await guardarMarcoManual(anterior, form);
    if (resultado.ok && !fila) {
      setCodigo("");
      setCantidad("1");
    }
    return resultado;
  }, estadoInicial);
  return (
    <form action={guardar} className="flex flex-wrap items-end gap-3">
      {fila ? <>
        <input type="hidden" name="id" value={fila.id} />
        <input type="hidden" name="cantidad_anterior" value={fila.cantidad} />
        <input type="hidden" name="comprado_anterior" value={String(fila.comprado)} />
      </> : <>
        <label className="grid min-w-32 flex-1 gap-1 text-sm font-semibold">
          Código de marco
          <input type="text" name="codigo" value={codigo} onChange={evento => setCodigo(evento.target.value)} maxLength={80} required className={campo} />
        </label>
        <label className="grid min-w-32 flex-1 gap-1 text-sm font-semibold">
          Proveedor
          <input type="text" name="proveedor" value={proveedor} onChange={evento => setProveedor(evento.target.value)} list="proveedores-de-marcos" maxLength={80} required className={campo} />
          <datalist id="proveedores-de-marcos">{proveedores.map(nombre => <option key={nombre} value={nombre} />)}</datalist>
        </label>
      </>}
      <label className="grid gap-1 text-sm font-semibold">
        Cantidad
        <input type="number" name="cantidad" min={1} step={1} inputMode="numeric" required value={cantidad} onChange={evento => setCantidad(evento.target.value)}
          aria-label={fila ? `Cantidad de ${fila.codigo}` : undefined} className={`w-24 tabular-nums ${campo}`} />
      </label>
      {fila && <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="comprado" checked={comprado} onChange={evento => setComprado(evento.target.checked)} aria-label={`Comprado ${fila.codigo}`} />
        Comprado
      </label>}
      <button type="submit" name="accion" value="guardar" disabled={enviando}
        className={`${boton} ${fila ? "bg-white text-brand-dark" : "bg-sidebar text-white"}`}>
        {enviando ? "Guardando…" : fila ? "Guardar" : "Agregar marco"}
      </button>
      {fila && <button type="submit" name="accion" value="quitar" disabled={enviando} formNoValidate
        aria-label={`Quitar ${fila.codigo}`} className={`${boton} bg-white text-tinta-suave`}>Quitar</button>}
      {estado.mensaje && <p role="status" className={`w-full text-sm ${estado.ok ? "text-emerald-800" : "text-red-700"}`}>{estado.mensaje}</p>}
    </form>
  );
}
