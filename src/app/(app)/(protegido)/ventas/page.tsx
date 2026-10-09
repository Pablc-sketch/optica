import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PuntoDeVenta from "./pos";
import { leerSugerenciasExtra } from "@/lib/sugerencias";

export default async function VentasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    pacientesRes, productosRes, costosRes, tenantRes, perfilRes, sucursalRes,
    recetasRes, laboratoriosRes, stockRes, labRes, montajeRes, recargoRes, promoRes, operativosRes,
  ] = await Promise.all([
    // Hasta 2.000: el buscador del punto de venta filtra en el navegador, así
    // que lo que no se carga no se encuentra. Si algún día se pasa, se avisa
    // en pantalla en vez de esconderlo (A12).
    supabase.from("pacientes").select("id, nombre, rut", { count: "exact" }).order("nombre").limit(2000),
    supabase
      .from("productos")
      .select("id, nombre, marca, precio_venta, categoria")
      .order("marca")
      .limit(2000),
    supabase
      .from("costos_cristales")
      .select(
        `tipo_lente, rango_receta, tratamiento, costo, costo_stock, precio_venta, precio_venta_stock,
         material_stock, material_laboratorio, diseno_laboratorio, montaje_material,
         diseno_laboratorio_proximo, diseno_proximo_desde`
      )
      .order("tipo_lente"),
    supabase.from("tenants").select("factor_venta_cristales, descuento_laboratorio_pct").single(),
    supabase.from("users").select("tenant_id").eq("id", user!.id).single(),
    supabase.from("sucursales").select("id").order("created_at").limit(1).maybeSingle(),
    supabase
      .from("recetas")
      // "*" y no una lista: si a la base le falta una columna nueva (una
      // migración sin aplicar), la consulta igual funciona y la venta sigue
      // encontrando la receta. Con una lista, faltaba sugerencias_extra y
      // la venta pedía el rango a mano para todos los pacientes.
      .select("*")
      // Dos recetas el mismo día: manda la última que se guardó, igual que
      // en la ficha del paciente.
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("proveedores").select("id, nombre").eq("tipo", "laboratorio").order("nombre"),
    // La lista del laboratorio, para calcular el costo real de cada
    // cristal contra la potencia de cada ojo (no contra un rango
    // aproximado) y decidir solo si sale de stock o hay que tallarlo.
    supabase.from("lab_precios_stock").select("material, diseno, esfera_max, cilindro_max, precio_unitario"),
    supabase.from("lab_precios_laboratorio").select("diseno, material, precio_unitario"),
    supabase.from("lab_precios_montaje").select("origen, material, diseno, precio"),
    supabase.from("lab_precios_recargo").select("categoria, concepto, precio"),
    supabase.from("lab_promociones").select("diseno, material, descuento_pct, desde, hasta, nota"),
    // Independiente del selector de sucursal (que es para stock físico):
    // planificados/realizados más recientes primero.
    supabase
      .from("operativos")
      .select("id, nombre, fecha, fecha_entrega_estimada")
      .in("estado", ["planificado", "realizado"])
      .order("fecha", { ascending: false }),
  ]);


  // Última receta por paciente: la OT creada desde el POS la enlaza sola
  // (también offline), y sus esfera/cilindro + sugerencia dejan la venta
  // precargada sin que la vendedora tenga que preguntar ni calcular nada.
  const recetasPorPaciente: Record<string, NonNullable<typeof recetasRes.data>[number]> = {};
  for (const r of recetasRes.data ?? []) {
    if (!recetasPorPaciente[r.paciente_id]) {
      recetasPorPaciente[r.paciente_id] = { ...r, sugerencias_extra: leerSugerenciasExtra(r.sugerencias_extra) };
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-4 text-xl font-bold">Punto de venta</h1>
        {(pacientesRes.count ?? 0) > (pacientesRes.data?.length ?? 0) && (
          <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">
            Hay más pacientes de los que caben en el buscador del punto de venta. Si no encuentras a alguien,
            ábrelo desde Pacientes.
          </p>
        )}
        <PuntoDeVenta
          pacientes={pacientesRes.data ?? []}
          productos={productosRes.data ?? []}
          costos={costosRes.data ?? []}
          laboratorios={laboratoriosRes.data ?? []}
          factorVenta={tenantRes.data?.factor_venta_cristales ?? 6}
          catalogoLab={{
            stock: stockRes.data ?? [],
            laboratorio: labRes.data ?? [],
            montaje: montajeRes.data ?? [],
            recargos: recargoRes.data ?? [],
            promociones: (promoRes.data ?? []).map((p) => ({ ...p, descuento_pct: Number(p.descuento_pct) })),
            descuentoPct: Number(tenantRes.data?.descuento_laboratorio_pct ?? 0),
          }}
          tenantId={perfilRes.data?.tenant_id ?? ""}
          sucursalId={sucursalRes.data?.id ?? null}
          vendedorId={user?.id ?? null}
          recetasPorPaciente={recetasPorPaciente}
          operativos={operativosRes.data ?? []}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/cobros" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-crema">
          💵 Cobros y entregas →
        </Link>
        <Link href="/ventas/historial" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-crema">
          Historial de ventas (editar, anular) →
        </Link>
      </div>
    </div>
  );
}
