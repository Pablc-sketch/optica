import type { createClient } from "@/lib/supabase/server";
import type { CatalogoLaboratorio } from "./costo-fides";
import type { FilaCristal } from "./precio-venta";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Todo lo que hace falta para cotizar un cristal como lo cotiza el punto
// de venta: el catálogo de /precios (lo que se cobra) y la lista del
// laboratorio (de dónde sale y cuánto cuesta). Se carga igual en cualquier
// pantalla que cotice, para que no vuelva a pasar que el tecnólogo vea un
// precio y la vendedora otro.
export async function cargarCatalogoParaCotizar(
  supabase: Supabase
): Promise<{ filas: FilaCristal[]; catalogo: CatalogoLaboratorio }> {
  const [costosRes, tenantRes, stockRes, labRes, montajeRes, recargoRes, promoRes] = await Promise.all([
    supabase
      .from("costos_cristales")
      .select(
        `tipo_lente, rango_receta, tratamiento, costo, precio_venta, precio_venta_stock,
         material_stock, material_laboratorio, diseno_laboratorio, montaje_material,
         diseno_laboratorio_proximo, diseno_proximo_desde`
      )
      .order("tipo_lente"),
    supabase.from("tenants").select("descuento_laboratorio_pct").single(),
    supabase.from("lab_precios_stock").select("material, diseno, esfera_max, cilindro_max, precio_unitario"),
    supabase.from("lab_precios_laboratorio").select("diseno, material, precio_unitario"),
    supabase.from("lab_precios_montaje").select("origen, material, diseno, precio"),
    supabase.from("lab_precios_recargo").select("categoria, concepto, precio"),
    supabase.from("lab_promociones").select("diseno, material, descuento_pct, desde, hasta, nota"),
  ]);

  // Un catálogo incompleto cotiza mal sin avisar: sin la lista de stock,
  // todo sale "de laboratorio"; sin el descuento, todo cuesta de más. Si
  // cualquiera de las lecturas falla, se avisa en vez de seguir con listas
  // vacías (F07).
  const fallo = [costosRes, tenantRes, stockRes, labRes, montajeRes, recargoRes, promoRes].find((r) => r.error);
  if (fallo?.error) throw new Error(`No se pudo leer el catálogo de precios: ${fallo.error.message}`);

  return {
    filas: (costosRes.data ?? []) as FilaCristal[],
    catalogo: {
      stock: (stockRes.data ?? []).map((s) => ({
        ...s,
        esfera_max: s.esfera_max === null ? null : Number(s.esfera_max),
        cilindro_max: s.cilindro_max === null ? null : Number(s.cilindro_max),
      })),
      laboratorio: labRes.data ?? [],
      montaje: montajeRes.data ?? [],
      recargos: recargoRes.data ?? [],
      promociones: (promoRes.data ?? []).map((p) => ({ ...p, descuento_pct: Number(p.descuento_pct) })),
      descuentoPct: Number(tenantRes.data?.descuento_laboratorio_pct ?? 0),
    },
  };
}
