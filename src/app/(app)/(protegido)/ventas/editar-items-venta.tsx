"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarVenta } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { CampoMonto } from "@/components/campos";

type Item = {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  otFolio: number | null;
};

export default function EditarItemsVenta({ ventaId, items, total }: { ventaId: string; items: Item[]; total: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  return (
    <form
      action={async (formData) => {
        setGuardando(true);
        setError(null);
        const resultado = await actualizarVenta(formData);
        setGuardando(false);
        if (resultado.ok) router.refresh();
        else setError(resultado.error);
      }}
      className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-4 shadow-sm"
    >
      <input type="hidden" name="venta_id" value={ventaId} />
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-sm sm:flex-row sm:items-end sm:gap-3">
            <p className="flex-1 text-sm font-medium">
              {item.descripcion}
              {/* Dos cristales pueden tener la misma descripción (mismo
                  tratamiento, uno lejos y otro cerca) — el folio de su OT
                  es lo único que los distingue acá. */}
              {item.otFolio !== null && (
                <span className="ml-1.5 text-xs font-normal text-tinta-suave">· OT #{item.otFolio}</span>
              )}
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
              Cantidad
              <input
                name={`cantidad_${item.id}`}
                type="number"
                min={1}
                defaultValue={item.cantidad}
                className="w-20 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
              Precio unitario
              <CampoMonto
                name={`precio_${item.id}`}
                defaultValue={item.precio_unitario}
                className="w-28 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-tinta-suave">
              Descuento
              <CampoMonto
                name={`descuento_${item.id}`}
                defaultValue={item.descuento}
                className="w-28 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
              />
            </label>
          </li>
        ))}
      </ul>
      <p className="text-xs text-tinta-suave">
        Solo se pueden ajustar cantidad, precio y descuento — para cambiar qué producto o cristal
        lleva la venta, anúlala y regístrala de nuevo.
      </p>
      {error && <p className="text-sm font-medium text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          disabled={guardando}
          className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {guardando ? "Guardando…" : "Guardar cambios"}
        </button>
        <span className="text-sm text-tinta-suave">
          Total actual: <b>{clp(total)}</b>
        </span>
      </div>
    </form>
  );
}
