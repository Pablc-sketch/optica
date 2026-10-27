"use server";

import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { prepararBusquedaSeguro } from "@/lib/seguros-busqueda";

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
