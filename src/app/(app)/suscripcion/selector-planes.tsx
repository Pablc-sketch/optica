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
  const plan = planes.find((p) => p.id === seleccionado) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {planes.map((p) => {
          const activo = p.id === seleccionado;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSeleccionado(activo ? null : p.id)}
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
        <section className="rounded-2xl bg-crema-claro p-4 text-sm shadow-sm">
          <p className="font-semibold">
            Transferir para activar el plan &quot;{plan.nombre}&quot; ({clp(plan.precio)}/mes)
          </p>
          <div className="mt-2 flex flex-col gap-1 rounded-xl bg-white p-3">
            <p>
              <span className="text-tinta-suave">Nombre:</span> {DATOS_TRANSFERENCIA.nombre}
            </p>
            <p>
              <span className="text-tinta-suave">RUT:</span> {formatearRut(DATOS_TRANSFERENCIA.rut)}
            </p>
            <p>
              <span className="text-tinta-suave">Banco:</span> {DATOS_TRANSFERENCIA.banco}
            </p>
            <p>
              <span className="text-tinta-suave">N° de cuenta:</span> {DATOS_TRANSFERENCIA.cuenta}
            </p>
            <p>
              <span className="text-tinta-suave">Correo:</span> {DATOS_TRANSFERENCIA.email}
            </p>
          </div>
          <p className="mt-2 text-tinta-suave">
            Después de transferir, mandá el comprobante a <b>proldan643@gmail.com</b> indicando el
            nombre de tu óptica y el plan elegido — la activamos a mano apenas lo recibimos. El pago
            en línea automático todavía no está conectado.
          </p>
        </section>
      )}
    </div>
  );
}
