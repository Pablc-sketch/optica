"use server";

// Configuración del negocio de cada óptica: precios propios, laboratorios,
// tarifas y reparto. Solo el administrador, siempre sobre su propia óptica
// (RLS). Nada se identifica por el nombre comercial.
import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";
import { repartoDesdeFormulario, TIPOS_LENTE } from "@/lib/configuracion-optica";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const monto = (v: FormDataEntryValue | null): number | null => {
  const t = String(v ?? "").replace(/[^\d]/g, "");
  return t === "" ? null : Number(t);
};

async function conAdmin(f: (ctx: Awaited<ReturnType<typeof requerirPerfil>>) => Promise<ResultadoAgenda>): Promise<ResultadoAgenda> {
  try {
    return await f(await requerirPerfil({ roles: ["admin"], suscripcion: true }));
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

function refrescar() {
  revalidatePath("/configuracion/negocio");
  revalidatePath("/ventas");
  revalidatePath("/cobros");
  revalidatePath("/precios");
}

export async function guardarNegocio(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const descuento = String(datos.get("consulta_descuento") ?? "ninguno");
    if (!["ninguno", "total", "monto"].includes(descuento)) return { error: "Revisa el descuento de la consulta." };
    const abono: Record<string, number> = {};
    for (const tipo of TIPOS_LENTE) {
      const m = monto(datos.get(`abono_${tipo}`));
      if (m !== null && m > 0) abono[tipo] = m;
    }
    const { error } = await supabase
      .from("configuracion_optica")
      .update({
        precio_consulta: monto(datos.get("precio_consulta")),
        consulta_descuento: descuento,
        consulta_descuento_monto: monto(datos.get("consulta_descuento_monto")) ?? 0,
        costo_marco_por_par: monto(datos.get("costo_marco_por_par")) ?? 0,
        precio_marco_premium: monto(datos.get("precio_marco_premium")),
        abono_minimo_por_tipo: abono,
        actualizado_en: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .select("tenant_id")
      .single();
    if (error) return { error: "No se pudo guardar la configuración." };
    refrescar();
    return { mensaje: "Guardado" };
  });
}

// Filas: tipo_N (vendedora|socio|ahorro), clave_N, nombre_N, pct_N.
export async function guardarReparto(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const filas: Parameters<typeof repartoDesdeFormulario>[0] = [];
    for (let i = 0; i < 12; i++) {
      const tipo = String(datos.get(`tipo_${i}`) ?? "");
      if (tipo !== "vendedora" && tipo !== "socio" && tipo !== "ahorro") continue;
      filas.push({
        tipo,
        clave: String(datos.get(`clave_${i}`) ?? "") || undefined,
        nombre: String(datos.get(`nombre_${i}`) ?? ""),
        pct: Number(String(datos.get(`pct_${i}`) ?? "0").replace(",", ".")) || 0,
      });
    }
    const r = repartoDesdeFormulario(filas);
    if ("error" in r) return { error: r.error };
    const { error } = await supabase
      .from("configuracion_optica")
      .update({ reparto: r.reparto, actualizado_en: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .select("tenant_id")
      .single();
    if (error) return { error: "No se pudo guardar el reparto." };
    refrescar();
    revalidatePath("/operativos", "layout");
    return { mensaje: r.reparto ? "Reparto guardado" : "Sin reparto" };
  });
}

export async function agregarLaboratorio(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const nombre = String(datos.get("nombre") ?? "").trim();
    if (!nombre || nombre.length > 100) return { error: "Escribe el nombre del laboratorio." };
    const { error } = await supabase.from("proveedores").insert({ tenant_id: tenantId, nombre, tipo: "laboratorio" });
    if (error) return { error: "No se pudo agregar el laboratorio." };
    refrescar();
    return { mensaje: "Laboratorio agregado" };
  });
}

// Una tarifa del laboratorio: cuánto cobra por unidad o por par, y si el
// montaje y el IVA vienen incluidos o se suman.
export async function guardarTarifa(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const id = String(datos.get("id") ?? "");
    const proveedor = String(datos.get("proveedor_id") ?? "");
    const tipo = String(datos.get("tipo_lente") ?? "").trim();
    const tratamiento = String(datos.get("tratamiento") ?? "").trim();
    const rango = String(datos.get("rango_receta") ?? "").trim() || null;
    const costo = monto(datos.get("costo"));
    const unidad = String(datos.get("unidad") ?? "");
    const montaje = String(datos.get("montaje") ?? "incluido");
    const iva = String(datos.get("iva") ?? "incluido");
    if ((id && !UUID.test(id)) || !UUID.test(proveedor) || !tipo || !tratamiento || costo === null
      || !["unidad", "par"].includes(unidad) || !["incluido", "aparte", "no_aplica"].includes(montaje)
      || !["incluido", "mas_iva"].includes(iva)) {
      return { error: "Completa laboratorio, tipo, tratamiento, costo y cómo cobra." };
    }
    const fila = {
      proveedor_id: proveedor, tipo_lente: tipo, tratamiento, rango_receta: rango, costo, unidad, montaje,
      montaje_costo: montaje === "aparte" ? (monto(datos.get("montaje_costo")) ?? 0) : 0, iva,
      activo: datos.get("activo") !== "off",
    };
    const { error } = await (id
      ? supabase.from("tarifas_laboratorio").update(fila).eq("id", id).eq("tenant_id", tenantId).select("id").single()
      : supabase.from("tarifas_laboratorio").insert({ ...fila, tenant_id: tenantId }).select("id").single());
    if (error) return { error: error.code === "23505" ? "Ya hay una tarifa igual para ese laboratorio." : "No se pudo guardar la tarifa." };
    refrescar();
    return { mensaje: "Tarifa guardada" };
  });
}

// Una fila del catálogo de cristales con el precio al cliente. El costo de
// compra no va acá: sale de la tarifa del laboratorio al vender.
export async function agregarCristalCatalogo(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const tipo = String(datos.get("tipo_lente") ?? "").trim();
    const tratamiento = String(datos.get("tratamiento") ?? "").trim();
    const rango = String(datos.get("rango_receta") ?? "").trim();
    const precio = monto(datos.get("precio_venta"));
    if (!TIPOS_LENTE.includes(tipo as (typeof TIPOS_LENTE)[number]) || !tratamiento || !rango || precio === null || precio <= 0) {
      return { error: "Completa tipo, tratamiento, rango y precio al cliente." };
    }
    const { error } = await supabase.from("costos_cristales").insert({
      tenant_id: tenantId, tipo_lente: tipo, tratamiento, rango_receta: rango, precio_venta: precio, costo: 0,
    });
    if (error) return { error: error.code === "23505" ? "Ese cristal ya está en el catálogo (edítalo en Precios)." : "No se pudo agregar el cristal." };
    refrescar();
    return { mensaje: "Cristal agregado" };
  });
}
