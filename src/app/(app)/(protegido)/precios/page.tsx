import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { actualizarPrecioProducto, actualizarCostoCristal } from "@/lib/actions/precios";
import { clp } from "@/lib/clp";
import { nombreCristal } from "@/lib/cristales";
import { CampoMonto } from "@/components/campos";

// Precios de venta de la óptica (armazones y productos), con búsqueda y
// pestañas por marca, más el costo/precio de cada combinación de cristal
// del laboratorio (costos_cristales) — el punto de venta los usa para
// calcular el precio y los reportes de utilidad, así que necesitan poder
// ajustarse al laboratorio real de cada óptica, no quedar fijos en la
// plantilla de referencia con la que se creó la óptica.

export default async function PreciosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; marca?: string }>;
}) {
  const { q, marca } = await searchParams;
  const supabase = await createClient();

  const [{ data: todos }, { data: cristales }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, marca, color, sku, categoria, costo, precio_venta")
      .order("marca")
      .order("nombre"),
    supabase
      .from("costos_cristales")
      .select("id, tipo_lente, rango_receta, tratamiento, costo, precio_venta")
      .order("tipo_lente")
      .order("rango_receta")
      .order("tratamiento"),
  ]);

  const productos = (todos ?? []).filter((p) => {
    if (marca && (p.marca ?? "Sin marca") !== marca) return false;
    if (q) {
      const texto = `${p.nombre} ${p.marca ?? ""} ${p.sku ?? ""} ${p.color ?? ""}`.toLowerCase();
      if (!texto.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const marcas = [...new Set((todos ?? []).map((p) => p.marca ?? "Sin marca"))].sort();

  const cristalesReales = cristales ?? [];
  const tiposLente = [...new Set(cristalesReales.map((c) => c.tipo_lente))];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold">Precios de venta</h1>
        <p className="text-sm text-tinta-suave">
          Lo que cobra tu óptica por armazones y productos. Edita el precio y guarda.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/precios"
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${!marca ? "bg-brand text-white" : "bg-crema-claro text-tinta-suave hover:bg-white"}`}
        >
          Todas
        </Link>
        {marcas.map((m) => (
          <Link
            key={m}
            href={`/precios?marca=${encodeURIComponent(m)}`}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${marca === m ? "bg-brand text-white" : "bg-crema-claro text-tinta-suave hover:bg-white"}`}
          >
            {m}
          </Link>
        ))}
        <form action="/precios" className="ml-auto flex gap-2">
          {marca && <input type="hidden" name="marca" value={marca} />}
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar código, modelo, color…"
            className="w-52 rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            Buscar
          </button>
        </form>
      </div>

      {productos.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          {q || marca ? "Sin resultados con ese filtro." : "Todavía no hay productos cargados."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
          {productos.map((p) => {
            const margen = p.precio_venta - p.costo;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
                {p.sku && (
                  <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-bold text-brand-dark">
                    {p.sku}
                  </span>
                )}
                <span className="min-w-40 flex-1 text-sm">
                  {p.marca ? `${p.marca} ` : ""}{p.nombre}{p.color ? ` · ${p.color}` : ""}
                </span>
                <span className="text-xs text-tinta-suave">
                  costo {clp(p.costo)} · margen {clp(margen)}
                </span>
                <form action={actualizarPrecioProducto} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <CampoMonto
                    name="precio"
                    defaultValue={p.precio_venta}
                    className="w-24 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                  />
                  <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                    Guardar
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <h2 className="text-xl font-bold">Costos de cristales (laboratorio)</h2>
        <p className="text-sm text-tinta-suave">
          Lo que te cobra tu laboratorio por cada combinación y lo que le cobras al cliente. Esto
          llegó precargado como referencia al crear la óptica — ajústalo al costo real de tu
          laboratorio para que la utilidad de los reportes sea la correcta.
        </p>
      </div>

      {tiposLente.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Todavía no hay costos de cristales cargados.
        </p>
      ) : (
        tiposLente.map((tipo) => (
          <details key={tipo} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
            <summary className="cursor-pointer font-semibold text-brand-dark">{tipo}</summary>
            <ul className="mt-3 flex flex-col gap-1.5">
              {cristalesReales
                .filter((c) => c.tipo_lente === tipo)
                .map((c) => {
                  const margen = c.precio_venta - c.costo;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
                      <span className="min-w-56 flex-1 text-sm">
                        {c.rango_receta} · {nombreCristal(c.tipo_lente, c.tratamiento)}
                      </span>
                      <span className="text-xs text-tinta-suave">margen {clp(margen)}</span>
                      <form action={actualizarCostoCristal} className="flex items-center gap-1.5">
                        <input type="hidden" name="id" value={c.id} />
                        <label className="flex items-center gap-1 text-xs text-tinta-suave">
                          Costo
                          <CampoMonto
                            name="costo"
                            defaultValue={c.costo}
                            className="w-24 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-tinta-suave">
                          Venta
                          <CampoMonto
                            name="precio"
                            defaultValue={c.precio_venta}
                            className="w-24 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                          />
                        </label>
                        <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                          Guardar
                        </button>
                      </form>
                    </li>
                  );
                })}
            </ul>
          </details>
        ))
      )}
    </div>
  );
}
