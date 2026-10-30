"use client";

import Link from "next/link";
import { useState } from "react";
import { compararEmisor, pendientesCompra, GUIAS_REEMBOLSO, type CompraReembolso } from "@/lib/reembolso";
import { requiereVoucher } from "@/lib/voucher";
import { formatearRut } from "@/lib/rut";
import { clp } from "@/lib/clp";
import { diaEnChile, fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";

type Entidad = keyof typeof GUIAS_REEMBOLSO;

// Reembolso en tres pasos: elegir la entidad, sacar los documentos y
// marcar lo que se juntó. La guía larga vive en docs/reembolsos.md.
export default function RevisionReembolso({ compra }: { compra: CompraReembolso }) {
  const [entidad, setEntidad] = useState<Entidad>("fonasa");
  const [emisores, setEmisores] = useState<Record<string, string>>({});
  const [revisados, setRevisados] = useState<Record<string, boolean>>({});
  const guia = GUIAS_REEMBOLSO[entidad];
  const pendientes = pendientesCompra(compra);
  const tarjetas = compra.pagos.filter((p) => requiereVoucher(p.medio_pago, p.monto));
  const distintos = tarjetas.filter((p) => compararEmisor(compra.optica?.rut_empresa, emisores[p.id] ?? "") === "distinto");
  const pasos = [
    { id: "receta", texto: entidad === "banmedica" ? "Receta (en presbicia la isapre no la exige)" : "Receta" },
    { id: "boleta", texto: "Boleta o voucher" },
    { id: "detalle", texto: entidad === "fonasa" ? "Certificado Fonasa firmado y timbrado" : "Comprobante detallado" },
    { id: "cedula", texto: "Cédula del paciente" },
  ];
  const listos = pasos.filter((p) => revisados[p.id]).length;
  const boton = "rounded-xl px-3 py-3 text-center font-semibold";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href={`/ventas/${compra.id}`} className="text-sm underline print:hidden">← Venta</Link>
          <h1 className="text-2xl font-bold">Reembolso</h1>
          <p className="text-sm text-tinta-suave">
            {compra.paciente?.nombre} · {formatearRut(compra.paciente?.rut)} · {fechaLegible(diaEnChile(compra.fecha))} · {clp(compra.total)}
          </p>
        </div>
        <div className="print:hidden"><BotonImprimir etiqueta="Guardar en PDF" /></div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-bold">1. ¿Dónde lo presenta?</h2>
        <div className="grid grid-cols-3 gap-2 print:hidden">
          {(Object.keys(GUIAS_REEMBOLSO) as Entidad[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => { setEntidad(id); setRevisados({}); }}
              className={`${boton} border-2 ${entidad === id ? "border-brand bg-brand text-white" : "border-tinta/15 bg-white"}`}
            >
              {id === "complementario" ? "Seguro" : GUIAS_REEMBOLSO[id].nombre}
            </button>
          ))}
        </div>
        <p className="hidden font-semibold print:block">{guia.nombre}</p>
      </section>

      <section className="flex flex-col gap-2 print:hidden">
        <h2 className="font-bold">2. Documentos</h2>
        <div className="grid grid-cols-2 gap-2">
          {entidad === "fonasa" && (
            <Link href={`/ventas/${compra.id}/certificado-fonasa`} className={`${boton} bg-brand text-white`}>Certificado Fonasa</Link>
          )}
          <Link href={`/ventas/${compra.id}/comprobante`} className={`${boton} ${entidad === "fonasa" ? "bg-white shadow-sm" : "bg-brand text-white"}`}>
            Comprobante
          </Link>
          <Link href={`/ventas/${compra.id}/expediente`} className={`${boton} bg-white shadow-sm`}>PDF + boleta</Link>
        </div>
        {pendientes.length > 0 && (
          <ul className="list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {pendientes.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
      </section>

      <fieldset className="rounded-xl bg-white p-4 shadow-sm">
        <legend className="px-1 font-bold">3. Junta esto ({listos}/{pasos.length})</legend>
        <div className="space-y-3">
          {pasos.map((p) => (
            <label key={p.id} className="flex items-center gap-3 text-base">
              <input type="checkbox" checked={!!revisados[p.id]} onChange={(e) => setRevisados({ ...revisados, [p.id]: e.target.checked })} className="size-5 shrink-0 print:hidden" />
              <span className="hidden print:inline">{revisados[p.id] ? "[✓]" : "[ ]"}</span>
              <span>{p.texto}</span>
            </label>
          ))}
        </div>
        <a href={guia.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold underline print:hidden">
          Requisitos de {guia.nombre} →
        </a>
      </fieldset>

      {tarjetas.length > 0 && (
        <details className="rounded-xl bg-white p-4 shadow-sm">
          <summary className="cursor-pointer font-bold">Revisar RUT de los vouchers</summary>
          <p className="mt-2 text-sm text-tinta-suave">Copia el RUT del comercio que sale en cada voucher.</p>
          {tarjetas.map((p) => {
            const estado = compararEmisor(compra.optica?.rut_empresa, emisores[p.id] ?? "");
            return (
              <div key={p.id} className="mt-3 rounded-lg bg-crema-claro p-3 text-sm">
                <p className="font-semibold">{fechaLegible(diaEnChile(p.fecha))} · {clp(p.monto)} · {p.medio_pago}</p>
                <input
                  aria-label="RUT del comercio en el voucher"
                  value={emisores[p.id] ?? ""}
                  onChange={(e) => setEmisores({ ...emisores, [p.id]: e.target.value })}
                  maxLength={12}
                  autoComplete="off"
                  placeholder="RUT del voucher"
                  className="mt-2 w-full rounded-lg border bg-white p-2 print:hidden"
                />
                <p className={`mt-1 font-semibold ${estado === "coincide" ? "text-green-800" : "text-amber-900"}`}>
                  {estado === "coincide" ? "✓ Coincide" : estado === "distinto" ? "No coincide con la óptica" : estado === "invalido" ? "RUT inválido" : ""}
                </p>
              </div>
            );
          })}
          {distintos.length > 0 && (
            <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm font-semibold text-amber-900">
              Pregunta a {guia.nombre} qué respaldo acepta antes de presentar.
            </p>
          )}
        </details>
      )}
    </div>
  );
}
