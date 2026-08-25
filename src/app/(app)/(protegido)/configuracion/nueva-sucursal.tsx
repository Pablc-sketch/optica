"use client";

import { useState } from "react";
import { crearSucursal } from "@/lib/actions/configuracion";
import { CampoTelefono } from "@/components/campos";

// Un operativo (examen en un colegio, empresa, junta de vecinos, etc.) usa
// la misma tabla que una sucursal fija, pero necesita datos que una
// sucursal fija no tiene sentido pedir (fecha, contacto); por eso esos
// campos solo aparecen cuando se elige "Operativo".
export default function NuevaSucursal() {
  const [tipo, setTipo] = useState<"local" | "operativo">("local");

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva sucursal</summary>
      <form action={crearSucursal} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre *
          <input name="nombre" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Tipo
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value === "operativo" ? "operativo" : "local")}
            className={input}
          >
            <option value="local">Local (sucursal fija)</option>
            <option value="operativo">Operativo (examen en terreno)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Dirección
          <input name="direccion" className={input} />
        </label>

        {tipo === "operativo" && (
          <>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fecha del operativo
              <input type="date" name="fecha_operativo" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contacto (colegio, empresa, etc.)
              <input name="contacto_nombre" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Teléfono de contacto
              <CampoTelefono name="contacto_telefono" className={input} />
            </label>
          </>
        )}

        <div className="sm:col-span-2">
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
            Crear sucursal
          </button>
        </div>
      </form>
    </details>
  );
}
