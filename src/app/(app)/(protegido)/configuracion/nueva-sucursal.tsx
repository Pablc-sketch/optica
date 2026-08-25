"use client";

import { crearSucursal } from "@/lib/actions/configuracion";

// Sucursal fija (para control de stock físico, inventario.sucursal_id) —
// distinto de un operativo (examen en terreno), que tiene su propia tabla
// y pantalla en /operativos.
export default function NuevaSucursal() {
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
          Dirección
          <input name="direccion" className={input} />
        </label>
        <div className="sm:col-span-2">
          <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
            Crear sucursal
          </button>
        </div>
      </form>
    </details>
  );
}
