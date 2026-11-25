import { crearPaciente, crearReceta } from "@/lib/actions/pacientes";
import { registrarVenta } from "@/lib/actions/ventas";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { esFalloTemporal } from "@/lib/offline/errores";
import type { AtencionesParaVenta, SolicitudTerreno } from "@/lib/offline/datos-terreno";
import { leerSugerenciasExtra } from "@/lib/sugerencias";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const responder = (datos: unknown, status = 200) => Response.json(datos, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return responder(null, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return responder(null, 415);
  const cuerpo = await request.text();
  if (cuerpo.length > 48_000) return responder({ ok: false, error: "El registro es demasiado grande." });
  let tarea: SolicitudTerreno;
  try {
    tarea = JSON.parse(cuerpo);
  } catch {
    return responder(null, 400);
  }
  if (!tarea || !UUID.test(tarea.usuarioId) || !["paciente", "receta", "venta"].includes(tarea.tipo)) return responder(null, 400);
  try {
    const { user } = await requerirPerfil({ roles: tarea.tipo === "venta" ? ["admin", "ventas"] : ["admin", "clinico"] });
    if (user.id !== tarea.usuarioId) return responder(null, 403);
    if (tarea.tipo === "venta") return responder(await registrarVenta(tarea.venta));
    if (!UUID.test(tarea.id) || !tarea.campos || !Number.isFinite(Date.parse(tarea.creada))) {
      return responder({ ok: false, error: "El registro guardado no es válido." });
    }
    const campos = Object.entries(tarea.campos);
    if (campos.length > 80 || campos.some(([, valor]) => typeof valor !== "string")) {
      return responder({ ok: false, error: "El formulario guardado no es válido." });
    }
    const formulario = new FormData();
    for (const [campo, valor] of campos) formulario.set(campo, valor);
    if (tarea.tipo === "paciente") return responder(await crearPaciente(formulario, tarea.id));
    formulario.set("receta_id_nuevo", tarea.id);
    await crearReceta(formulario, tarea.creada);
    return responder({ ok: true });
  } catch (error) {
    if (error instanceof SinPermiso) return responder(null, 403);
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string" &&
        !esFalloTemporal({ code: error.code }) && !/^(PGRST|42P)/.test(error.code)) {
      return responder({ ok: false, error: "Revisa los datos guardados de esta atención." });
    }
    return responder(null, 503);
  }
}

export async function GET(request: Request) {
  const operativo = new URL(request.url).searchParams.get("operativo") ?? "";
  if (!UUID.test(operativo)) return responder(null, 400);
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin", "ventas"] });
    const { data: filas, error } = await supabase.from("recetas")
      .select("id,paciente_id,tipo,operativo_id,od_esfera,od_cilindro,od_add,oi_esfera,oi_cilindro,oi_add,sugerencia_tipo_lente,sugerencia_tratamiento,sugerencia_tipo_lente_cerca,sugerencia_tratamiento_cerca,sugerencias_extra,pacientes!inner(id,nombre,rut)")
      .eq("tenant_id", tenantId).eq("operativo_id", operativo)
      .order("created_at", { ascending: false }).order("id").limit(100);
    if (error) return responder(null, 503);
    const resultado: AtencionesParaVenta = { pacientes: [], recetas: {} };
    for (const { paciente_id, pacientes, ...receta } of filas ?? []) {
      if (resultado.recetas[paciente_id]) continue;
      const paciente = Array.isArray(pacientes) ? pacientes[0] : pacientes;
      if (!paciente) continue;
      resultado.pacientes.push(paciente);
      resultado.recetas[paciente_id] = { ...receta, sugerencias_extra: leerSugerenciasExtra(receta.sugerencias_extra) };
    }
    return responder(resultado);
  } catch {
    return responder(null, 503);
  }
}
