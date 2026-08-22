"use client";

import { useState } from "react";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";

type Plan = {
  id: string;
  nombre: string;
  precio: number;
  detalle: string[];
};

const DATOS_TRANSFERENCIA = {
  nombre: "Pablo Alfonso Vargas Roldán",
  rut: "151638732",
  banco: "Mercado Pago — Cuenta Vista",
  cuenta: "1011785757",
  email: "proldan0000@gmail.com",
};

export default function SelectorPlanes({ planes }: { planes: Plan[] }) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const plan = planes.find((p) => p.id === seleccionado) ?? null;

  function elegir(id: string) {
    const activo = id === seleccionado;
    setSeleccionado(activo ? null : id);
    // Al deseleccionar el plan, el botón flotante de pago deja de tener
    // sentido: se cierra en el mismo click, no en un efecto aparte.
    if (activo) setPagando(false);
  }

  return (
    <div className="flex flex-col gap-4 pb-16">
      <div className="grid gap-3 sm:grid-cols-2">
        {planes.map((p) => {
          const activo = p.id === seleccionado;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p.id)}
              className={`rounded-2xl p-4 text-left shadow-sm transition ${
                activo ? "bg-brand/10 ring-2 ring-brand" : "bg-crema-claro hover:bg-white"
              }`}
            >
              <p className="font-bold">{p.nombre}</p>
              <p className="mt-1 text-2xl font-bold">
                {clp(p.precio)}
                <span className="text-sm font-medium text-tinta-suave"> /mes</span>
              </p>
              <ul className="mt-3 flex flex-col gap-1 text-sm text-tinta-suave">
                {p.detalle.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
              <p className="mt-3 text-xs font-semibold text-brand-dark">
                {activo ? "✓ Seleccionado" : "Tocar para elegir este plan"}
              </p>
            </button>
          );
        })}
      </div>

      {plan && (
        <div className="fixed bottom-4 right-4 z-20 sm:bottom-6 sm:right-6">
          <button
            type="button"
            onClick={() => setPagando(true)}
            className="rounded-full bg-brand px-5 py-3 text-sm font-bold text-white shadow-lg transition hover:bg-brand-dark hover:shadow-xl"
          >
            Pagar {clp(plan.precio)}/mes →
          </button>
        </div>
      )}

      {plan && pagando && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-tinta/50 p-0 sm:items-center sm:p-4"
          onClick={() => setPagando(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                  Plan {plan.nombre}
                </p>
                <p className="text-2xl font-bold text-tinta">{clp(plan.precio)} / mes</p>
              </div>
              <button
                type="button"
                onClick={() => setPagando(false)}
                aria-label="Cerrar"
                className="rounded-full p-1.5 text-tinta-suave transition hover:bg-crema"
              >
                ✕
              </button>
            </div>

            <p className="text-sm font-semibold text-tinta">Transferir para activar</p>
            <div className="mt-2 flex flex-col divide-y divide-tinta-suave/10 overflow-hidden rounded-2xl border border-tinta-suave/15 bg-crema-claro text-sm">
              {[
                ["Nombre", DATOS_TRANSFERENCIA.nombre],
                ["RUT", formatearRut(DATOS_TRANSFERENCIA.rut)],
                ["Banco", DATOS_TRANSFERENCIA.banco],
                ["N° de cuenta", DATOS_TRANSFERENCIA.cuenta],
                ["Correo", DATOS_TRANSFERENCIA.email],
                ["Monto", `${clp(plan.precio)} (mensual)`],
              ].map(([etiqueta, valor]) => (
                <div key={etiqueta} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <span className="text-tinta-suave">{etiqueta}</span>
                  <span className="font-semibold text-tinta">{valor}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 rounded-xl bg-brand/10 p-3 text-xs text-tinta">
              Después de transferir, mandá el comprobante a <b>proldan643@gmail.com</b> indicando el
              nombre de tu óptica y el plan elegido (&quot;{plan.nombre}&quot;) — lo activamos a mano
              apenas lo recibimos. El pago en línea automático todavía no está conectado.
            </p>

            <button
              type="button"
              onClick={() => setPagando(false)}
              className="mt-4 w-full rounded-lg border border-tinta-suave/25 py-2.5 text-sm font-semibold text-tinta-suave transition hover:bg-crema"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
