"use server";

import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { prepararBusquedaSeguro } from "@/lib/seguros-busqueda";
import type { CompraReembolso } from "@/lib/reembolso";

export async function cargarCompraReembolso(id: string): Promise<CompraReembolso | null> {
  const { supabase, tenantId } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return null;
  const [venta, optica] = await Promise.all([
    supabase.from("ventas").select("id, fecha, total, anulada, pacientes:paciente_id(nombre, rut), venta_items(descripcion, cantidad, precio_unitario, descuento), pagos_abonos(id, fecha, monto, medio_pago, numero_voucher)").eq("tenant_id", tenantId).eq("id", id).maybeSingle(),
    supabase.from("tenants").select("nombre_comercial, razon_social, rut_empresa").eq("id", tenantId).maybeSingle(),
  ]);
  if (venta.error || optica.error) throw new Error("No pudimos cargar los documentos. Recarga la página.");
  if (!venta.data) return null;
  const paciente = Array.isArray(venta.data.pacientes) ? venta.data.pacientes[0] : venta.data.pacientes;
  return {
    id: venta.data.id, fecha: venta.data.fecha, total: venta.data.total, anulada: venta.data.anulada,
    paciente: paciente ?? null, optica: optica.data,
    items: venta.data.venta_items ?? [],
    pagos: [...(venta.data.pagos_abonos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha)),
  };
}

export type CompraSeguro = {
  id: string;
  fecha: string;
  total: number;
  abonado: number;
  paciente: { nombre: string; rut: string | null };
};
export type ResultadoSeguros = { compras: CompraSeguro[]; error?: string; limitado?: boolean };

export async function buscarDocumentosSeguro(texto: string): Promise<ResultadoSeguros> {
  let contexto;
  try {
    contexto = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  } catch (error) {
    if (error instanceof SinPermiso) return { compras: [], error: error.message };
    throw error;
  }
  const busqueda = prepararBusquedaSeguro(texto);
  if (!busqueda) return { compras: [], error: "Escribe al menos 3 letras del nombre o el RUT completo." };
  const { supabase, tenantId } = contexto;
  // La acción usa la sesión y RLS; no recibe el tenant desde el navegador.
  // No se descargan pacientes antes de buscar ni se envía el RUT en la URL.
  const consultas = await Promise.all(busqueda.patrones.map((patron) => supabase
    .from("ventas")
    .select("id, fecha, total, pacientes:paciente_id!inner(nombre, rut), pagos_abonos(monto)")
    .eq("tenant_id", tenantId)
    .eq("anulada", false)
    .ilike(`pacientes.${busqueda.campo}`, patron)
    .order("fecha", { ascending: false })
    .limit(21)));
  if (consultas.some((r) => r.error)) return { compras: [], error: "No pudimos buscar los documentos. Intenta de nuevo." };
  const unicas = new Map<string, CompraSeguro>();
  for (const consulta of consultas) {
    for (const venta of consulta.data ?? []) {
      const paciente = (Array.isArray(venta.pacientes) ? venta.pacientes[0] : venta.pacientes) as { nombre: string; rut: string | null } | null;
      if (!paciente) continue;
      unicas.set(venta.id, {
        id: venta.id, fecha: venta.fecha, total: venta.total, paciente,
        abonado: (venta.pagos_abonos ?? []).reduce((s, pago) => s + pago.monto, 0),
      });
    }
  }
  const compras = [...unicas.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return { compras: compras.slice(0, 20), limitado: compras.length > 20 };
}
