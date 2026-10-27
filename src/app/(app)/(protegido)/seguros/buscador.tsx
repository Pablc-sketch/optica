"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buscarDocumentosSeguro, type ResultadoSeguros } from "@/lib/actions/seguros";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, fechaLegible } from "@/lib/fechas";

export default function BuscadorSeguros() {
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<ResultadoSeguros | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">Seguros y reembolsos</h1>
      <p className="text-sm text-tinta-suave">Encuentra los documentos de una compra.</p>
      <form action={() => iniciar(async () => {
        setResultado(null);
        try { setResultado(await buscarDocumentosSeguro(texto)); }
        catch { setResultado({ compras: [], error: "No pudimos buscar. Recarga la página e intenta de nuevo." }); }
      })} className="flex flex-wrap gap-2">
        <label htmlFor="busqueda-seguro" className="w-full text-sm font-semibold">Nombre o RUT del paciente</label>
        <input id="busqueda-seguro" value={texto} onChange={(e) => { setTexto(e.target.value); setResultado(null); }} disabled={pendiente}
          minLength={3} maxLength={80} required autoComplete="off" placeholder="Nombre o RUT completo"
          className="min-w-0 flex-1 rounded-xl border border-tinta-suave/30 bg-white px-3 py-3" />
        <button disabled={pendiente} className="rounded-xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-60">{pendiente ? "Buscando…" : "Buscar"}</button>
      </form>
      <div aria-live="polite" aria-busy={pendiente}>
        {resultado?.error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{resultado.error}</p>}
        {resultado && !resultado.error && resultado.compras.length === 0 && <p className="p-3 text-sm">No encontramos compras vigentes. Revisa el nombre o RUT.</p>}
        {resultado?.limitado && <p className="mb-2 text-sm">Se muestran las 20 compras más recientes. Usa el RUT completo para precisar la búsqueda.</p>}
        <ul className="flex flex-col gap-3">
          {resultado?.compras.map((compra) => (
            <li key={compra.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
              <h2 className="font-bold">{compra.paciente.nombre}</h2>
              <p className="text-sm text-tinta-suave">{formatearRut(compra.paciente.rut)} · {fechaLegible(diaEnChile(compra.fecha))}</p>
              <p className="mt-2 text-sm">Total <b>{clp(compra.total)}</b> · Pagado <b>{clp(compra.abonado)}</b> · Saldo <b>{clp(Math.max(0, compra.total - compra.abonado))}</b></p>
              <div className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
                <Link href={`/ventas/${compra.id}/comprobante`} className="rounded-lg bg-brand px-3 py-2 text-white">Comprobante detallado</Link>
                <Link href={`/ventas/${compra.id}/certificado-fonasa`} className="rounded-lg border border-brand/30 px-3 py-2">Certificado Fonasa</Link>
                <Link href={`/ventas/${compra.id}`} className="rounded-lg border border-tinta-suave/30 px-3 py-2">Ver compra</Link>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <details className="rounded-2xl border border-tinta-suave/20 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">¿Qué documentos entregar?</summary>
        <div className="mt-3 space-y-2 text-tinta-suave">
          <p>Receta, boleta o voucher válido y certificado de compra cuando falte el detalle. Revisa los requisitos de la entidad y del plan.</p>
          <p>El comprobante de Lentia muestra la compra y los abonos. Acompáñalo del documento tributario correspondiente; no asegura por sí solo un reembolso.</p>
          <p>Verifica el RUT del comercio en el voucher y en el certificado. Si difieren, conserva los originales y solicita la corrección antes de presentar el expediente.</p>
          <Link href="/boleta" className="inline-block font-semibold text-brand-dark underline">Ayuda con boletas</Link>
        </div>
      </details>
    </div>
  );
}
