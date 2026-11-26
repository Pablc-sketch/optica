import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarCompraMarcos } from "@/lib/cargar-compra-marcos";
import type { FilaCompraMarcos } from "@/lib/compra-marcos";
import AnotarCompra from "./anotar-compra";

const pendientes = (filas: FilaCompraMarcos[]) => filas.reduce((total, fila) => total + (fila.comprado ? 0 : (fila.porComprar ?? 0)), 0);
const sinConteo = (filas: FilaCompraMarcos[]) => filas.reduce((total, fila) => total + (fila.porComprar === null ? fila.pedidos : 0), 0);

export default async function ListaCompraMarcos() {
  const { supabase, tenantId } = await exigirRolPagina(["admin", "ventas"]);
  const cabecera = <CabeceraPagina seccion="Inventario" titulo="Lista de compra de marcos" acciones={
    <Link href="/inventario" className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold">Ver inventario</Link>
  } />;
  const resultado = await cargarCompraMarcos(supabase, tenantId).catch(() => null);
  if (!resultado) return <div className="space-y-4">{cabecera}
    <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-900">
      No se pudo cargar la lista. Recarga para volver a consultar los pedidos.
    </p>
  </div>;

  const { filas, revisar } = resultado;
  const utiles = filas.filter(fila => fila.stock === null || (fila.porComprar ?? 0) > 0);
  const porProveedor = new Map<string, FilaCompraMarcos[]>();
  for (const fila of utiles) {
    const grupo = porProveedor.get(fila.proveedor) ?? [];
    grupo.push(fila);
    porProveedor.set(fila.proveedor, grupo);
  }

  const proveedores = [...porProveedor].sort((a, b) => pendientes(b[1]) - pendientes(a[1]));

  return <div className="mx-auto max-w-5xl space-y-5 pb-4">
    {cabecera}
    <p className="text-sm text-tinta-suave">Marcos de ventas vigentes con OT pendientes de preparar. Anota solo las unidades disponibles para estos pedidos.</p>
    <dl className="grid grid-cols-3 gap-2">
      {[
        ["Por comprar", pendientes(utiles)],
        ["Unidades por contar", sinConteo(utiles)],
        ["Por revisar", revisar.length],
      ].map(([titulo, total]) => <div key={titulo} className="rounded-xl border border-tinta/10 bg-white p-3">
        <dt className="text-sm font-medium">{titulo}</dt>
        <dd className="mt-1 text-xl font-bold tabular-nums">{total}</dd>
      </div>)}
    </dl>
    {!utiles.length && !revisar.length && <p className="rounded-xl bg-white p-4 font-semibold">No hay marcos pendientes de compra.</p>}
    {proveedores.map(([proveedor, modelos]) => <section key={proveedor} className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">{proveedor}</h2>
        <p className="text-sm text-tinta-suave">{pendientes(modelos)} por comprar{sinConteo(modelos) ? ` · ${sinConteo(modelos)} unidades por contar` : ""}</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {modelos.map(fila => <li key={fila.clave} className="rounded-xl border border-tinta/10 bg-white p-3">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="min-w-0 break-words font-bold">{fila.codigo}</h3>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${fila.comprado || fila.porComprar === 0 ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-950"}`}>
              {fila.comprado ? `${fila.porComprar} comprado${fila.porComprar === 1 ? "" : "s"}`
                : fila.porComprar === null ? "Por contar" : fila.porComprar === 0 ? "Cubierto" : `Comprar ${fila.porComprar}`}
            </span>
          </div>
          {fila.descripcion && <p className="text-sm text-tinta-suave">{fila.descripcion}</p>}
          <p className="text-sm tabular-nums">
            {fila.pedidos} {fila.pedidos === 1 ? "unidad pedida" : "unidades pedidas"} · OT {fila.folios.join(", ")}
            {fila.stock !== null && ` · Stock ${fila.stock}`}
          </p>
          <AnotarCompra key={`${fila.revision}:${fila.enMano}:${fila.comprado}:${fila.porComprar}`} fila={fila} />
        </li>)}
      </ul>
    </section>)}
    {revisar.length > 0 && <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <h2 className="text-lg font-bold text-amber-950">Confirmar código o variante</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {revisar.map(fila => <li key={`${fila.orden}:${fila.par}`} className="rounded-lg bg-white p-3 text-sm">
          <Link href={`/ot/${fila.orden}#corregir-ot`} className="font-bold text-brand-dark underline">OT #{fila.folio}</Link>
          <span> · Par {fila.par}{fila.sede ? ` · ${fila.sede}` : ""}</span>
          <p className="mt-1">{[fila.codigo, fila.descripcion].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-amber-950">{fila.motivo}</p>
        </li>)}
      </ul>
    </section>}
  </div>;
}
