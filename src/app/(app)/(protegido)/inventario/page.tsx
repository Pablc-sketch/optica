import { createClient } from "@/lib/supabase/server";
import { actualizarStockMinimo, registrarMovimiento } from "@/lib/actions/inventario";
import { clp } from "@/lib/clp";
import NuevoProducto from "./nuevo-producto";
import NuevoProveedor from "./nuevo-proveedor";

type Producto = {
  nombre: string;
  marca: string | null;
  color: string | null;
  sku: string | null;
  precio_venta: number;
  categoria: string;
  imagen_url: string | null;
};

function uno<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

const TIPOS: Record<string, { etiqueta: string; clase: string }> = {
  entrada: { etiqueta: "Entrada", clase: "bg-green-100 text-green-700" },
  salida: { etiqueta: "Salida", clase: "bg-red-100 text-red-700" },
  ajuste: { etiqueta: "Ajuste", clase: "bg-amber-100 text-amber-800" },
};

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string }>;
}) {
  const { sucursal } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: sucursales }, perfilRes] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre"),
    supabase.from("users").select("tenant_id").eq("id", user!.id).single(),
  ]);
  const sucursalActiva = sucursal || sucursales?.[0]?.id;
  const tenantId = perfilRes.data?.tenant_id ?? "";

  const [stockRes, movimientosRes, proveedoresRes] = await Promise.all([
    supabase
      .from("inventario")
      .select(
        "id, stock_actual, stock_minimo, producto_id, sucursal_id, productos:producto_id (nombre, marca, color, sku, precio_venta, categoria, imagen_url)"
      )
      .eq("sucursal_id", sucursalActiva ?? "")
      .order("stock_actual"),
    supabase
      .from("movimientos_inventario")
      .select("id, tipo, cantidad, referencia, fecha, productos:producto_id (nombre, marca)")
      .eq("sucursal_id", sucursalActiva ?? "")
      .order("fecha", { ascending: false })
      .limit(15),
    supabase.from("proveedores").select("id, nombre, tipo").order("nombre"),
  ]);
  const proveedores = proveedoresRes.data ?? [];

  const stock = stockRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];
  const criticos = stock.filter((s) => s.stock_actual <= s.stock_minimo);
  const valorInventario = stock.reduce((total, s) => {
    const p = uno(s.productos as unknown as Producto | Producto[] | null);
    return total + (p?.precio_venta ?? 0) * s.stock_actual;
  }, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Inventario</h1>
        {sucursales && sucursales.length > 1 && (
          <form action="/inventario" className="flex items-center gap-2">
            <select
              name="sucursal"
              defaultValue={sucursalActiva}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
            <button className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Ver
            </button>
          </form>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Productos</p>
          <p className="mt-1 text-2xl font-bold">{stock.length}</p>
        </div>
        <div className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Bajo mínimo</p>
          <p className={`mt-1 text-2xl font-bold ${criticos.length > 0 ? "text-brand-dark" : ""}`}>
            {criticos.length}
          </p>
        </div>
        <div className="col-span-2 rounded-2xl bg-crema-claro p-4 shadow-sm sm:col-span-1">
          <p className="text-sm text-tinta-suave">Valor a precio de venta</p>
          <p className="mt-1 text-2xl font-bold">{clp(valorInventario)}</p>
        </div>
      </div>

      <NuevoProducto sucursales={sucursales ?? []} sucursalActiva={sucursalActiva} proveedores={proveedores} tenantId={tenantId} />

      <section>
        <h2 className="mb-2 font-semibold">Proveedores</h2>
        <div className="flex flex-col gap-2">
          <NuevoProveedor />
          {proveedores.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
              {proveedores.map((p) => (
                <li key={p.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-medium">{p.nombre}</span>
                  <span className="text-xs text-tinta-suave capitalize">{p.tipo}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Stock</h2>
        {stock.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            No hay productos con stock en esta sucursal.
          </p>
        ) : (
          <ul className="flex flex-col gap-2 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {stock.map((s) => {
              const p = uno(s.productos as unknown as Producto | Producto[] | null);
              const critico = s.stock_actual <= s.stock_minimo;
              return (
                <li key={s.id} className={`rounded-xl px-3 py-2.5 ${critico ? "bg-brand/10" : "bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {p?.categoria === "armazon" &&
                      (p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-crema text-base">
                          🕶️
                        </span>
                      ))}
                    {p?.sku && (
                      <span className="rounded-md bg-brand/15 px-2 py-0.5 text-xs font-bold text-brand-dark">
                        {p.sku}
                      </span>
                    )}
                    <span className="min-w-32 flex-1 text-sm font-medium">
                      {p?.marca ? `${p.marca} ` : ""}{p?.nombre}{p?.color ? ` · ${p.color}` : ""}
                    </span>
                    <span className={`text-sm font-bold ${critico ? "text-brand-dark" : ""}`}>
                      {s.stock_actual} {critico && "⚠"}
                    </span>
                    <form action={actualizarStockMinimo} className="flex items-center gap-1">
                      <input type="hidden" name="inventario_id" value={s.id} />
                      <label className="text-xs text-tinta-suave">mín</label>
                      <input
                        name="stock_minimo"
                        inputMode="numeric"
                        defaultValue={s.stock_minimo}
                        className="w-14 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-right text-sm outline-none focus:border-brand"
                      />
                      <button className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium transition hover:bg-crema">
                        ✓
                      </button>
                    </form>
                  </div>

                  <form action={registrarMovimiento} className="mt-2 flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="producto_id" value={s.producto_id} />
                    <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                    <select name="tipo" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand">
                      <option value="entrada">Entrada</option>
                      <option value="salida">Salida</option>
                      <option value="ajuste">Ajuste</option>
                    </select>
                    <input
                      name="cantidad"
                      inputMode="numeric"
                      placeholder="Cant."
                      className="w-16 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-right text-xs outline-none focus:border-brand"
                    />
                    <input
                      name="referencia"
                      placeholder="Motivo (opcional)"
                      className="w-40 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                    />
                    <button className="rounded-lg bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
                      Registrar
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Últimos movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin movimientos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {movimientos.map((m) => {
              const p = uno(m.productos as unknown as { nombre: string; marca: string | null } | { nombre: string; marca: string | null }[] | null);
              const tipo = TIPOS[m.tipo] ?? TIPOS.ajuste;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="text-xs text-tinta-suave">
                    {new Date(m.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tipo.clase}`}>
                    {tipo.etiqueta}
                  </span>
                  <span className="min-w-28 flex-1 truncate">
                    {p?.marca ? `${p.marca} ` : ""}{p?.nombre}
                  </span>
                  <span className="font-semibold">{m.cantidad > 0 ? "+" : ""}{m.cantidad}</span>
                  {m.referencia && <span className="text-xs text-tinta-suave">{m.referencia}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
