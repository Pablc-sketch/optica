import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  actualizarPrecioProducto,
  actualizarCostoCristal,
  actualizarNombreLaboratorio,
} from "@/lib/actions/precios";
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
      .select(
        `id, tipo_lente, rango_receta, tratamiento, costo, costo_stock, precio_venta,
         nombre_laboratorio, material_stock, material_laboratorio, diseno_laboratorio`
      )
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
          Lo que te cobra tu laboratorio por cada combinación y lo que le cobras al cliente. Todos
          los cristales se le piden al laboratorio, pero los que ya tiene hechos (<strong>stock</strong>)
          los cobra bastante más barato que los que <strong>talla a medida</strong>: por eso son dos
          costos y no uno. Si dejas el de stock vacío, el punto de venta cobra el de tallado aunque
          se marque &quot;de stock&quot;.
        </p>
        <p className="mt-1 text-xs text-tinta-suave">
          Los costos son del par completo: precio unitario del laboratorio × 2 + montaje + IVA.
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

            {/* El laboratorio no conoce los nombres internos con que se
                vende acá: pide los de SU catálogo. Se escribe una vez por
                tratamiento (no por rango, que es el mismo producto en otra
                potencia) y la planilla del pedido imprime ese nombre. */}
            <div className="mt-3 rounded-xl border border-tinta-suave/20 bg-white p-3">
              <p className="text-sm font-semibold">Cómo se llama en el laboratorio</p>
              <p className="mb-2 text-xs text-tinta-suave">
                Opcional. Si lo llenas, la planilla que mandas al laboratorio imprime este nombre en vez
                del interno — así no hay que traducirlo por teléfono al hacer el pedido.
              </p>
              <ul className="flex flex-col gap-1.5">
                {[...new Set(cristalesReales.filter((c) => c.tipo_lente === tipo).map((c) => c.tratamiento))].map(
                  (trat) => {
                    const actual = cristalesReales.find(
                      (c) => c.tipo_lente === tipo && c.tratamiento === trat && c.nombre_laboratorio
                    )?.nombre_laboratorio;
                    return (
                      <li key={trat} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-52 flex-1 text-sm">{nombreCristal(tipo, trat)}</span>
                        <form action={actualizarNombreLaboratorio} className="flex items-center gap-1.5">
                          <input type="hidden" name="tipo_lente" value={tipo} />
                          <input type="hidden" name="tratamiento" value={trat} />
                          <input
                            name="nombre_laboratorio"
                            defaultValue={actual ?? ""}
                            placeholder="Nombre en el catálogo del laboratorio"
                            className="w-72 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                          />
                          <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                            Guardar
                          </button>
                        </form>
                      </li>
                    );
                  }
                )}
              </ul>
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
              {cristalesReales
                .filter((c) => c.tipo_lente === tipo)
                .map((c) => {
                  // El margen más chico posible: contra el costo de tallarlo
                  // a medida, que es el caro. Si sale de stock, queda mejor.
                  const margen = c.precio_venta - c.costo;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2">
                      <span className="min-w-56 flex-1 text-sm">
                        {c.rango_receta} · {nombreCristal(c.tipo_lente, c.tratamiento)}
                        {(c.material_stock || c.material_laboratorio) && (
                          <span className="block text-xs text-tinta-suave">
                            En la lista del laboratorio:{" "}
                            {[
                              c.material_stock && `stock "${c.material_stock}"`,
                              c.material_laboratorio &&
                                `a medida "${[c.diseno_laboratorio, c.material_laboratorio].filter(Boolean).join(" ")}"`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-tinta-suave">
                        margen mínimo {clp(margen)}
                        {c.costo_stock !== null && ` · de stock ${clp(c.precio_venta - c.costo_stock)}`}
                      </span>
                      <form action={actualizarCostoCristal} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={c.id} />
                        <label className="flex items-center gap-1 text-xs text-tinta-suave">
                          Ya hecho (stock)
                          <CampoMonto
                            name="costo_stock"
                            defaultValue={c.costo_stock ?? undefined}
                            placeholder="No lo tiene"
                            className="w-24 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-tinta-suave">
                          Tallado a medida
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
