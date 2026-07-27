"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearProducto } from "@/lib/actions/inventario";

const CATEGORIAS = [
  { valor: "armazon", etiqueta: "Armazón (marco)" },
  { valor: "cristal", etiqueta: "Cristal" },
  { valor: "lente_contacto", etiqueta: "Lente de contacto" },
  { valor: "otro", etiqueta: "Otro" },
];

export default function NuevoProducto({
  sucursales,
  sucursalActiva,
}: {
  sucursales: { id: string; nombre: string }[];
  sucursalActiva?: string;
}) {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function accion(formData: FormData) {
    setGuardando(true);
    setMensaje(null);
    const resultado = await crearProducto(formData);
    setGuardando(false);
    if (resultado.ok) {
      setMensaje("✓ Producto creado");
      router.refresh();
    } else {
      setMensaje(resultado.error ?? "No se pudo crear el producto.");
    }
  }

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo producto</summary>
      <form action={accion} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Categoría
          <select name="categoria" defaultValue="armazon" className={input}>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>{c.etiqueta}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre *
          <input name="nombre" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Marca
          <input name="marca" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Modelo
          <input name="modelo" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Color
          <input name="color" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          SKU / código
          <input name="sku" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Costo
          <input name="costo" inputMode="numeric" defaultValue={0} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Precio de venta
          <input name="precio_venta" inputMode="numeric" defaultValue={0} className={input} />
        </label>

        {sucursales.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm font-medium">
            Sucursal (para el stock inicial)
            <select name="sucursal_id" defaultValue={sucursalActiva} className={input}>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
        ) : (
          <input type="hidden" name="sucursal_id" value={sucursales[0]?.id ?? ""} />
        )}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Stock inicial
          <input name="stock_inicial" inputMode="numeric" defaultValue={0} className={input} />
        </label>

        {mensaje && (
          <p className={`text-sm font-medium sm:col-span-2 ${mensaje.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>
            {mensaje}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {guardando ? "Creando…" : "Crear producto"}
          </button>
        </div>
      </form>
    </details>
  );
}
