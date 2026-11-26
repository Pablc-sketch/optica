import CabeceraPagina from "@/components/cabecera-pagina";
import BotonEnviar from "@/components/boton-enviar";
import Link from "next/link";
import { leerTodas } from "@/lib/leer-todas";
import { exigirRolPagina } from "@/lib/autorizacion";
import { actualizarStockMinimo, registrarMovimiento } from "@/lib/actions/inventario";
import { clp } from "@/lib/clp";
import { filtrarProductos } from "@/lib/buscar-producto";
import { formatoCodigoColor } from "@/lib/ficha-marco";
import FichaMarco from "./ficha-marco";
import NuevoProducto from "./nuevo-producto";
import NuevoProductoMasivo from "./nuevo-producto-masivo";
import NuevoProveedor from "./nuevo-proveedor";

type Producto = {
  nombre: string;
  marca: string | null;
  material: string | null;
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
const entrada = (texto: string | undefined) => typeof texto === "string" ? texto.trim().slice(0, 100) : "";
const opciones = (valores: (string | null)[]) => [...new Set(valores.filter((valor): valor is string => Boolean(valor)))]
  .sort((a, b) => a.localeCompare(b, "es", { numeric: true }));

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ sucursal?: string; q?: string; estado?: string; pagina?: string; marca?: string; material?: string; color?: string }>;
}) {
  const params = await searchParams;
  const { sucursal, estado, pagina: paginaPedida } = params;
  const busca = entrada(params.q);
  const marca = entrada(params.marca);
  const material = entrada(params.material);
  const color = entrada(params.color);
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
        "id, stock_actual, stock_minimo, producto_id, sucursal_id, productos:producto_id (nombre, marca, material, color, sku, modelo, codigo_color, precio_venta, categoria, imagen_url)"
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
  const negativos = marcos.filter(f => f.stock < 0);
  const porReponer = negativos.reduce((total, f) => total - f.stock, 0);
  const colores = (f: Producto) => [f.color, formatoCodigoColor(f.codigo_color)];
  const camposFiltro = [
    { nombre: "marca", titulo: "Marca", activo: marca, valores: opciones(marcos.map(f => f.marca)) },
    { nombre: "material", titulo: "Material", activo: material, valores: opciones(marcos.map(f => f.material)) },
    { nombre: "color", titulo: "Color o variante", activo: color, valores: opciones(marcos.flatMap(f => colores(f))) },
  ];
  const filtrando = camposFiltro.some(filtro => filtro.activo);
  const enLista = filtrarProductos(filas.filter(f => {
    const enEstado = estado === "disponibles" ? f.stock > 0 : estado === "agotados" ? f.stock === 0
      : estado === "negativos" ? f.stock < 0 : true;
    return enEstado && (!marca || f.marca === marca) && (!material || f.material === material) && (!color || colores(f).includes(color));
  }), busca);
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
    for (const filtro of camposFiltro) if (filtro.activo) params.set(filtro.nombre, filtro.activo);
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

      <div className="grid grid-cols-2 gap-2">
        <Link href={`/inventario?sucursal=${sucursalActiva}&estado=disponibles#stock`} className="rounded-xl border border-tinta/10 bg-white p-3">
          <span className="text-sm font-medium">Disponibles</span>
          <b className="block text-xl tabular-nums text-emerald-800">{disponibles}</b>
        </Link>
        <Link href={`/inventario?sucursal=${sucursalActiva}&estado=negativos#stock`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <span className="text-sm font-medium">Unidades por reponer</span>
          <b className="block text-xl tabular-nums text-amber-950">{porReponer}</b>
          <span className="text-xs text-amber-950">{negativos.length} {negativos.length === 1 ? "código" : "códigos"} en negativo</span>
        </Link>
      </div>

      {puedeEditar && <details className="rounded-xl border border-tinta/10 bg-white p-3 sm:p-4">
        <summary className="cursor-pointer font-bold text-brand-dark">Agregar marco</summary>
        <p className="mb-3 mt-2 text-sm text-tinta-suave">Si el código ya está cargado, se suman las unidades ingresadas.</p>
        <FichaMarco key={sucursalActiva} sucursalId={sucursalActiva} proveedores={proveedores.filter(p => p.tipo !== "laboratorio")} />
      </details>}

      <section id="stock" className="scroll-mt-24" aria-label="Stock de inventario">
        <form action="/inventario#stock" className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="sucursal" value={sucursalActiva} />
          <label className="grid min-w-40 flex-1 gap-1 text-sm font-semibold">Buscar marco
            <input name="q" type="search" defaultValue={busca} maxLength={100} placeholder="Código, marca, material o color"
              className="rounded-lg border border-tinta/20 bg-white px-3 py-2.5 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Stock
            <select name="estado" defaultValue={estado ?? ""} className="rounded-lg border border-tinta/20 bg-white px-3 py-2.5">
              <option value="">Todos</option><option value="disponibles">Disponibles</option>
              <option value="agotados">Agotados</option><option value="negativos">En negativo</option>
            </select>
          </label>
          <button className="rounded-lg bg-tinta px-4 py-2.5 text-sm font-semibold text-white">Buscar</button>
          {(busca || estado || filtrando) && <Link href={`/inventario?sucursal=${sucursalActiva}#stock`} className="px-2 py-2.5 text-sm font-semibold underline">Limpiar</Link>}
          <details open={filtrando || undefined} className="basis-full text-sm">
            <summary className="cursor-pointer py-1 font-semibold text-brand-dark">Filtros de marca, material y color</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">{camposFiltro.map(filtro => (
              <label key={filtro.nombre} className="grid gap-1 text-sm font-medium">{filtro.titulo}
                <select name={filtro.nombre} defaultValue={filtro.activo} className="min-w-0 rounded-lg border border-tinta/20 bg-white px-2 py-2">
                  <option value="">Todos</option>
                  {filtro.valores.map(valor => <option key={valor} value={valor}>{valor}</option>)}
                </select>
              </label>
            ))}</div>
          </details>
        </form>
        {enLista.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
            {stock.length ? "No hay coincidencias con esa búsqueda." : "Aún no hay productos cargados en esta sucursal."}
          </p>
        ) : (
          <ul className="divide-y divide-tinta/10 overflow-hidden rounded-xl border border-tinta/10 bg-white">
            {visibles.map(({ fila: s, ...p }) => {
              const codigoColor = formatoCodigoColor(p.codigo_color);
              const nombre = p.sku && p.nombre !== p.sku ? p.nombre : null;
              const variante = [p.color, codigoColor].filter(Boolean).join(" ");
              const descripcion = [p.marca, nombre, p.material, variante].filter(Boolean).join(" · ");
              return (
                <li key={s.id} className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.categoria === "armazon" && p.imagen_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imagen_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1 break-words text-sm">
                      <p className="font-bold">{p.sku || p.nombre}</p>
                      {descripcion && <p className="text-xs text-tinta-suave">{descripcion}</p>}
                    </div>
                    <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-bold tabular-nums ${s.stock_actual < 0 ? "bg-amber-50 text-amber-950" : "bg-crema-claro text-tinta"}`}>
                      {s.stock_actual === 0 ? "Agotado" : `Stock ${s.stock_actual}`}
                    </span>
                    {puedeEditar && <details className="shrink-0 open:basis-full open:rounded-lg open:border open:border-tinta/10 open:p-3">
                    <summary className="cursor-pointer py-0.5 text-xs font-semibold text-tinta-suave">{p.categoria === "armazon" ? "Ficha" : "Ajustar stock"}</summary>
                    {p.categoria === "armazon" && <div className="my-2 border-b border-tinta/10 pb-3">
                      <FichaMarco key={`${s.producto_id}:${p.marca}:${p.material}:${p.color}`} datos={{ id: s.producto_id, marca: p.marca, material: p.material, color: p.color }} />
                    </div>}
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
          {puedeEditar && <NuevoProductoMasivo key={sucursalActiva} sucursalId={sucursalActiva} />}
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
