import "server-only";

import { codigoEnDescripcion, prepararCompraMarcos } from "@/lib/compra-marcos";
import { leerTodas } from "@/lib/leer-todas";
import { esOpticaGlobal } from "@/lib/marca-optica";
import type { createClient } from "@/lib/supabase/server";

type Relacion<T> = T | T[] | null;
const uno = <T>(valor: Relacion<T>) => Array.isArray(valor) ? valor[0] ?? null : valor;
type VentaCompra = { id: string; venta_items: { descripcion: string; producto_id: string | null; cristal_slot: number | null }[] };

export async function cargarCompraMarcos(supabase: Awaited<ReturnType<typeof createClient>>, tenantId: string) {
  const [ots, catalogo, conteos, tenant] = await Promise.all([
    leerTodas((a, b) => supabase.from("ordenes_trabajo").select(
      "id,folio,tipo_lente,tipo_lente_2,armazon_producto_id,armazon_producto_id_2,marco_propio,marco_propio_2,marco_codigo,marco_codigo_2,marco_descripcion,marco_descripcion_2,operativos:operativo_id(nombre),venta_items(venta_id)"
    ).eq("tenant_id", tenantId).not("estado", "in", "(listo,entregado,cancelado)").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("productos")
      .select("id,sku,marca,proveedores:proveedor_id(nombre),inventario(stock_actual)")
      .eq("tenant_id", tenantId).eq("categoria", "armazon").order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("lista_compra_marcos").select("clave,revision,en_mano,comprados")
      .eq("tenant_id", tenantId).order("clave").range(a, b)),
    supabase.from("tenants").select("nombre_comercial").eq("id", tenantId).single(),
  ]);
  if (ots.error || catalogo.error || conteos.error || tenant.error) throw new Error("No se pudo cargar la lista de compra.");

  const ordenes = ots.data;
  const ids = [...new Set(ordenes.flatMap(ot => ot.venta_items.map(item => item.venta_id as string)))];
  const lotes = [];
  for (let i = 0; i < ids.length; i += 100) lotes.push(ids.slice(i, i + 100));
  const ventas = await Promise.all(lotes.map(lote => leerTodas((a, b) => supabase
    .from("ventas").select("id,venta_items(descripcion,producto_id,cristal_slot)")
    .eq("tenant_id", tenantId).eq("anulada", false).in("id", lote).order("id").range(a, b))));
  if (ventas.some(res => res.error)) throw new Error("No se pudieron verificar las ventas de la lista de compra.");

  const codigosPorVenta = new Map((ventas.flatMap(res => res.data ?? []) as VentaCompra[]).map(venta => [
    venta.id, [...new Set(venta.venta_items.flatMap(item => {
      const codigo = !item.producto_id && !item.cristal_slot && /^marco\b/i.test(item.descripcion)
        ? codigoEnDescripcion(item.descripcion) : null;
      return codigo ? [codigo] : [];
    }))],
  ]));
  const marcos = ordenes.flatMap(ot => {
    const ventasActivas = [...new Set(ot.venta_items.map(item => item.venta_id as string))].filter(id => codigosPorVenta.has(id));
    const datos = {
      orden: ot.id as string, folio: ot.folio as number,
      sede: uno(ot.operativos as unknown as Relacion<{ nombre: string }>)?.nombre ?? null,
      ventasActivas: ventasActivas.length, codigosVenta: ventasActivas.flatMap(id => codigosPorVenta.get(id) ?? []),
    };
    return [
      { ...datos, par: 1, lente: ot.tipo_lente, producto: ot.armazon_producto_id, propio: ot.marco_propio, codigo: ot.marco_codigo, descripcion: ot.marco_descripcion },
      { ...datos, par: 2, lente: ot.tipo_lente_2, producto: ot.armazon_producto_id_2, propio: ot.marco_propio_2, codigo: ot.marco_codigo_2, descripcion: ot.marco_descripcion_2 },
    ].filter(par => par.lente);
  });
  const productos = catalogo.data.map(p => ({
    id: p.id as string, sku: p.sku as string | null, marca: p.marca as string | null,
    proveedor: uno(p.proveedores as unknown as Relacion<{ nombre: string }>)?.nombre ?? null,
    stock: p.inventario.length ? p.inventario.reduce((suma, registro) => suma + Number(registro.stock_actual), 0) : null,
  }));
  return prepararCompraMarcos(marcos, productos, conteos.data, esOpticaGlobal(tenant.data.nombre_comercial) ? "Inochi" : "Proveedor sin asignar");
}
