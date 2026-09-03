"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, fechaLegible } from "@/lib/fechas";

const ESTADOS: Record<string, { label: string; clase: string }> = {
  recepcion: { label: "Recepción", clase: "bg-sky-100 text-sky-800" },
  laboratorio: { label: "Laboratorio", clase: "bg-amber-100 text-amber-800" },
  montaje: { label: "Montaje", clase: "bg-amber-100 text-amber-800" },
  listo: { label: "Listo", clase: "bg-brand/15 text-brand-dark" },
  entregado: { label: "Entregado", clase: "bg-green-100 text-green-700" },
  // Antes esto caía al valor por omisión de abajo (Recepción) — una venta
  // anulada dejaba su OT marcada "cancelado" pero acá se seguía viendo como
  // si estuviera activa y pendiente de recepción.
  cancelado: { label: "Cancelada", clase: "bg-neutral-200 text-neutral-600" },
};

export type OTConDatos = {
  id: string;
  folio: number;
  estado: string;
  tipo_lente: string | null;
  tratamiento: string | null;
  fecha_ingreso: string;
  fecha_entrega_real: string | null;
  pacientes: { nombre: string; rut: string | null } | null;
};

export default function BuscarOTCliente({
  ots,
  ventaPorOT,
}: {
  ots: OTConDatos[];
  ventaPorOT: Record<string, { ventaId: string; total: number; saldo: number; fecha: string }>;
}) {
  const [texto, setTexto] = useState("");

  const resultados = useMemo(() => {
    const q = texto.trim();
    if (!q) return [];
    // Coincidencias parciales, así van apareciendo antes de terminar de
    // escribir el RUT o el folio completo.
    const soloDigitos = q.replace(/\D/g, "");
    const rutFormateado = formatearRut(q);
    const qLower = q.toLowerCase();
    return ots
      .filter((ot) => {
        const nombre = ot.pacientes?.nombre?.toLowerCase() ?? "";
        const rut = ot.pacientes?.rut ?? "";
        const folioStr = String(ot.folio);
        return (
          (soloDigitos.length > 0 && folioStr.startsWith(soloDigitos)) ||
          (rutFormateado.length > 0 && rut.startsWith(rutFormateado)) ||
          (nombre.length > 0 && nombre.includes(qLower))
        );
      })
      .slice(0, 30);
  }, [texto, ots]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Buscar orden de trabajo</h1>
        <Link href="/ot" className="text-sm font-medium text-brand-dark hover:underline">
          ← Volver al tablero
        </Link>
      </div>

      <input
        value={texto}
        onChange={(e) => {
          const v = e.target.value;
          // Si empieza con un número se asume RUT o folio y se le pone el
          // punto al tiro; si empieza con letra, es búsqueda por nombre.
          setTexto(/^\d/.test(v.trim()) ? formatearRut(v) : v);
        }}
        placeholder="RUT del paciente, folio de la OT o nombre…"
        className="w-full rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
      />

      {texto && resultados.length === 0 && (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          No se encontró ninguna orden de trabajo para &quot;{texto}&quot;.
        </p>
      )}

      {resultados.length > 0 && (
        <ul className="flex flex-col gap-2">
          {resultados.map((ot) => {
            const estado = ESTADOS[ot.estado] ?? ESTADOS.recepcion;
            const venta = ventaPorOT[ot.id];
            return (
              <li key={ot.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/ot/${ot.id}`} className="font-bold text-brand-dark hover:underline">
                    OT #{ot.folio}
                  </Link>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estado.clase}`}>
                    {estado.label}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium">{ot.pacientes?.nombre ?? "—"}</span>
                  {ot.pacientes?.rut && (
                    <span className="text-xs text-tinta-suave">{formatearRut(ot.pacientes.rut)}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-tinta-suave">
                  {[ot.tipo_lente, ot.tratamiento].filter(Boolean).join(" · ") || "Sin detalle de cristal"}
                </p>
                <p className="mt-1 text-xs text-tinta-suave">
                  Ingreso: {fechaLegible(diaEnChile(ot.fecha_ingreso))}
                  {ot.fecha_entrega_real && (
                    <> · Entregado: {fechaLegible(diaEnChile(ot.fecha_entrega_real))}</>
                  )}
                  {venta && (
                    <>
                      {" "}
                      · Compra del {fechaLegible(diaEnChile(venta.fecha))} por {clp(venta.total)}
                      {venta.saldo > 0 && <> (saldo {clp(venta.saldo)})</>}
                    </>
                  )}
                </p>
                {venta && (
                  <Link
                    href={`/ventas/${venta.ventaId}/comprobante`}
                    className="mt-1 inline-block text-xs font-medium text-brand-dark hover:underline"
                  >
                    🖨 Ver comprobante de esa compra
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
