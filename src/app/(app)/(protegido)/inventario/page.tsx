import CabeceraPagina from "@/components/cabecera-pagina";
import BotonEnviar from "@/components/boton-enviar";
import Link from "next/link";
import { leerTodas } from "@/lib/leer-todas";
import { exigirRolPagina } from "@/lib/autorizacion";
import { actualizarStockMinimo, registrarMovimiento } from "@/lib/actions/inventario";
import { clp } from "@/lib/clp";
import { filtrarProductos } from "@/lib/buscar-producto";
import NuevoProducto from "./nuevo-producto";
import NuevoProductoMasivo from "./nuevo-producto-masivo";
import NuevoProveedor from "./nuevo-proveedor";

type Producto = {
  nombre: string;
  marca: string | null;
  color: string | null;
  modelo: string | null;
  codigo_color: string | null;
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
const porPagina = 25;

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string; q?: string; estado?: string; pagina?: string }>;
}) {
  const { sucursal, q, estado, pagina: paginaPedida } = await searchParams;
  const busca = typeof q === "string" ? q.trim().slice(0, 100) : "";
  const { supabase, rol } = await exigirRolPagina(["admin", "ventas", "bodega", "clinico"]);
  const puedeEditar = rol !== "clinico";

  const { data: sucursales, error: sucursalesError } = await supabase.from("sucursales").select("id, nombre").order("created_at").order("id");
  if (sucursalesError) throw new Error("No se pudieron cargar las sucursales");
  if (!sucursales?.length) return <div className="rounded-2xl bg-white p-5 shadow-sm">
    <CabeceraPagina seccion="Administración" titulo="Inventario" />
    <p className="mt-2 text-sm text-tinta-suave">Agrega una sucursal para registrar stock.</p>
    <Link href="/configuracion" className="mt-3 inline-block rounded-xl bg-brand px-4 py-2.5 font-semibold text-white">Configurar sucursal</Link>
  </div>;
  const actual = sucursales.find(s => s.id === sucursal) ?? sucursales[0];
  const sucursalActiva = actual.id;

  const [stockRes, movimientosRes, proveedoresRes] = await Promise.all([
    leerTodas((a,b) => supabase
      .from("inventario")
      .select(
        "id, stock_actual, stock_minimo, producto_id, sucursal_id, productos:producto_id (nombre, marca, color, sku, modelo, codigo_color, precio_venta, categoria, imagen_url)"
      )
      .eq("sucursal_id", sucursalActiva ?? "")
      .order("stock_actual").order("id").range(a,b)),
    supabase
      .from("movimientos_inventario")
      .select("id, tipo, cantidad, referencia, fecha, productos:producto_id (nombre, marca, sku)")
      .eq("sucursal_id", sucursalActiva ?? "")
      .order("fecha", { ascending: false })
      .limit(15),
    supabase.from("proveedores").select("id, nombre, tipo").order("nombre"),
  ]);
  if (stockRes.error || movimientosRes.error || proveedoresRes.error) throw new Error("No se pudo cargar el inventario");
  const proveedores = proveedoresRes.data ?? [];

  const stock = stockRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];
  const filas = stock.flatMap(fila => {
    const producto = uno(fila.productos as unknown as Producto | Producto[] | null);
    return producto ? [{ ...producto, fila, stock: fila.stock_actual }] : [];
  });
  const marcos = filas.filter(f => f.categoria === "armazon");
  const disponibles = marcos.reduce((total, f) => total + Math.max(0, f.stock), 0);
  const negativos = filas.filter(f => f.stock < 0).length;
  const enLista = filtrarProductos(filas.filter(f => estado === "disponibles" ? f.stock > 0
    : estado === "agotados" ? f.stock === 0 : estado === "negativos" ? f.stock < 0 : true), busca);
  const valorInventario = stock.reduce((total, s) => {
    const p = uno(s.productos as unknown as Producto | Producto[] | null);
    return total + (p?.precio_venta ?? 0) * Math.max(0, s.stock_actual);
  }, 0);
  const paginas = Math.max(1, Math.ceil(enLista.length / porPagina));
  const pagina = Math.min(paginas, Math.max(1, Number.parseInt(paginaPedida ?? "", 10) || 1));
  const visibles = enLista.slice((pagina - 1) * porPagina, pagina * porPagina);
  function enlaceStock(n: number) {
    const params = new URLSearchParams({ sucursal: sucursalActiva });
    if (busca) params.set("q", busca);
    if (estado) params.set("estado", estado);
    if (n > 1) params.set("pagina", String(n));
    return `/inventario?${params}#stock`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <CabeceraPagina seccion="Administración" titulo="Inventario" acciones={(rol === "admin" || rol === "ventas") && (
            <Link href="/inventario/compras" className="rounded-lg bg-sidebar px-3 py-2 text-sm font-semibold text-white">
              Lista de compra
            </Link>
          )} />
          <p className="text-sm text-tinta-suave">{actual.nombre}</p>
        </div>
        {sucursales && sucursales.length > 1 && (
          <form action="/inventario" className="flex items-center gap-2">
            <select
              name="sucursal"
              aria-label="Sucursal"
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

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Marcos disponibles</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{disponibles}</p>
        </div>
        <Link href={`/inventario?sucursal=${sucursalActiva}&estado=negativos#stock`} className="rounded-2xl bg-white p-4 shadow-sm">
          <p className="text-sm text-tinta-suave">Códigos con saldo negativo</p>
          <p className={`mt-1 text-2xl font-bold ${negativos > 0 ? "text-amber-800" : ""}`}>{negativos}</p>
        </Link>
      </div>

      {puedeEditar && <NuevoProductoMasivo key={sucursalActiva} sucursalId={sucursalActiva} />}

      <section id="stock" className="scroll-mt-5">
        <form action="/inventario#stock" className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="sucursal" value={sucursalActiva} />
          <label className="grid min-w-36 flex-1 gap-1 text-sm font-semibold">Buscar por código, modelo o marca
            <input name="q" type="search" defaultValue={busca} maxLength={100} placeholder="Ej. LY-2187L C-2"
              className="rounded-xl border border-tinta/20 bg-white px-3 py-2.5 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Stock
            <select name="estado" defaultValue={estado ?? ""} className="rounded-xl border border-tinta/20 bg-white px-3 py-2.5">
              <option value="">Todos</option><option value="disponibles">Disponibles</option>
              <option value="agotados">Agotados</option><option value="negativos">Saldos negativos</option>
            </select>
          </label>
          <button className="rounded-xl bg-tinta px-4 py-2.5 text-sm font-semibold text-white">Buscar</button>
          {(busca || estado) && <Link href={`/inventario?sucursal=${sucursalActiva}#stock`} className="rounded-xl px-2 py-2.5 text-sm font-semibold underline">Limpiar</Link>}
        </form>
        {enLista.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            {stock.length ? "No hay coincidencias con esa búsqueda." : "Aún no hay productos cargados en esta sucursal."}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {visibles.map(({ fila: s, ...p }) => {
              const critico = s.stock_actual <= s.stock_minimo;
              return (
                <li key={s.id} className={`rounded-xl px-3 py-2.5 ${critico ? "bg-brand/10" : "bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {p.categoria === "armazon" && p.imagen_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-32 flex-1 break-words text-sm">
                      {p.sku && <p className="font-bold">{p.sku}</p>}
                      {(!p.sku || p.sku !== p.nombre || p.marca || p.color) &&
                        <p className="text-tinta-suave">{[p.marca, p.nombre, p.color].filter(Boolean).join(" · ")}</p>}
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${critico ? "text-brand-dark" : ""}`}>
                      {s.stock_actual < 0 ? `Por reponer · ${-s.stock_actual}`
                        : s.stock_actual === 0 ? "Agotado" : `${s.stock_actual} ${s.stock_actual === 1 ? "unidad" : "unidades"}`}
                    </span>
                    {puedeEditar && <details className="basis-full rounded-lg px-1 py-1 open:border open:border-tinta/10 open:p-3"><summary className="cursor-pointer text-xs font-semibold text-tinta-suave">Ajustar stock</summary>
                    <form action={actualizarStockMinimo} className="flex items-center gap-1">
                      <input type="hidden" name="inventario_id" value={s.id} />
                      <span className="text-xs text-tinta-suave">Mínimo</span>
                      <input
                        name="stock_minimo"
                        aria-label="Stock mínimo"
                        inputMode="numeric"
                        defaultValue={s.stock_minimo}
                        className="w-14 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-right text-sm outline-none focus:border-brand"
                      />
                      <BotonEnviar className="rounded-lg border border-tinta-suave/30 px-3 py-2 text-sm font-medium transition hover:bg-crema">Guardar mínimo</BotonEnviar>
                    </form>

                  <form action={registrarMovimiento} className="mt-2 flex flex-wrap items-center gap-1.5">
                    <input type="hidden" name="producto_id" value={s.producto_id} />
                    <input type="hidden" name="sucursal_id" value={s.sucursal_id} />
                    <select name="tipo" aria-label="Tipo de movimiento" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand">
                      <option value="entrada">Entrada</option>
                      <option value="salida">Salida</option>
                      <option value="ajuste">Ajuste</option>
                    </select>
                    <input
                      name="cantidad"
                      aria-label="Cantidad del movimiento"
                      required
                      inputMode="numeric"
                      placeholder="Cant."
                      className="w-16 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-right text-xs outline-none focus:border-brand"
                    />
                    <input
                      name="referencia"
                      aria-label="Motivo del movimiento"
                      placeholder="Motivo (opcional)"
                      className="w-40 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                    />
                    <BotonEnviar className="rounded-lg bg-brand/10 px-3 py-2 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">Registrar</BotonEnviar>
                  </form>
                  </details>}</div>
                </li>
              );
            })}
          </ul>
        )}
        {paginas > 1 && <nav aria-label="Páginas de inventario" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          {pagina > 1 ? <Link className="py-2 font-semibold underline" href={enlaceStock(pagina - 1)}>Anterior</Link> : <span />}
          <span>{pagina} de {paginas}</span>
          {pagina < paginas ? <Link className="py-2 font-semibold underline" href={enlaceStock(pagina + 1)}>Siguiente</Link> : <span />}
        </nav>}
      </section>

      <details className="rounded-2xl bg-white p-4 shadow-sm">
        <summary className="mb-2 cursor-pointer font-semibold">Últimos movimientos</summary>
        {movimientos.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin movimientos registrados.</p>
        ) : (
          <ul className="flex flex-col gap-1.5 rounded-2xl bg-crema-claro p-3 shadow-sm">
            {movimientos.map((m) => {
              const p = uno(m.productos as unknown as Pick<Producto, "nombre" | "marca" | "sku"> | Pick<Producto, "nombre" | "marca" | "sku">[] | null);
              const tipo = TIPOS[m.tipo] ?? TIPOS.ajuste;
              const cantidad = m.tipo === "salida" ? -m.cantidad : m.cantidad;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="text-xs text-tinta-suave">
                    {new Date(m.fecha).toLocaleDateString("es-CL", { day: "numeric", month: "short", timeZone: "America/Santiago" })}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tipo.clase}`}>
                    {tipo.etiqueta}
                  </span>
                  <span className="min-w-28 flex-1 truncate">
                    {p?.marca ? `${p.marca} ` : ""}{p?.nombre}
                    {p?.sku && p.sku !== p.nombre && <span className="ml-2 text-xs font-semibold">{p.sku}</span>}
                  </span>
                  <span className="font-semibold">{cantidad > 0 ? "+" : ""}{cantidad}</span>
                  {m.referencia && <span className="text-xs text-tinta-suave">{m.referencia.startsWith("venta:") ? "Venta" : m.referencia}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </details>
      <details className="rounded-2xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold">Catálogo y proveedores</summary>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-tinta-suave">{marcos.length} códigos de marcos · Valor de stock a precio de venta {clp(valorInventario)}</p>
          {puedeEditar && <NuevoProducto sucursales={sucursales} sucursalActiva={sucursalActiva} proveedores={proveedores} />}
          {puedeEditar && <NuevoProveedor />}
          {proveedores.length > 0 && <ul className="divide-y divide-tinta/10">
            {proveedores.map(p => <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span>{p.nombre}</span><span className="capitalize text-tinta-suave">{p.tipo}</span>
            </li>)}
          </ul>}
        </div>
      </details>
    </div>
  );
}
