"use server";

import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { validarCambios, type Cambios } from "@/lib/cambios-operativo";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Aplica un cambio que el asistente preparó. Solo el administrador, solo
// dentro de Lentia, con su sesión (RLS) y volviendo a validar todo. Guarda
// el valor anterior en asistente_cambios.
export async function aplicarCambioOperativo(input: { operativoId: string; cambios: unknown }): Promise<ResultadoAgenda> {
  try {
    const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    if (!input || typeof input.operativoId !== "string" || !UUID.test(input.operativoId)) return { error: "Operativo no válido." };
    const v = validarCambios(input.cambios);
    if ("error" in v) return { error: v.error };
    const columnas = Object.keys(v.cambios).join(", ");
    const actual = await supabase.from("operativos").select(columnas).eq("id", input.operativoId).eq("tenant_id", tenantId).maybeSingle();
    if (actual.error || !actual.data) return { error: "No se encontró el operativo." };
    const r = await supabase.from("operativos").update(v.cambios).eq("id", input.operativoId).eq("tenant_id", tenantId).select("id").single();
    if (r.error) {
      // Los horarios pasan por la agenda: si choca con otro operativo, la base lo rechaza.
      return { error: r.error.message.includes("ocupad") || r.error.code === "23P01" ? "Ese horario choca con otro operativo del mismo equipo." : "No se pudo guardar el cambio." };
    }
    await supabase.from("asistente_cambios").insert({
      tenant_id: tenantId, operativo_id: input.operativoId, usuario_id: user.id, antes: actual.data as Cambios, despues: v.cambios,
    });
    revalidatePath(`/operativos/${input.operativoId}`);
    revalidatePath("/operativos");
    return { mensaje: "Guardado" };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

// Notas que la IA usa siempre (lo que la óptica le enseñó).
export async function agregarNotaIA(datos: FormData): Promise<ResultadoAgenda> {
  try {
    const { supabase, tenantId, user } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    const texto = String(datos.get("texto") ?? "").replace(/\s+/g, " ").trim();
    if (texto.length < 3 || texto.length > 300) return { error: "Escribe la nota (hasta 300 caracteres)." };
    const r = await supabase.from("ia_conocimiento").insert({ tenant_id: tenantId, texto, origen: "manual", creado_por: user.id });
    if (r.error) return { error: "No se pudo guardar." };
    revalidatePath("/configuracion/ia");
    return { mensaje: "La IA lo tendrá en cuenta" };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

export async function borrarNotaIA(datos: FormData): Promise<ResultadoAgenda> {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"] });
    const id = String(datos.get("id") ?? "");
    if (!UUID.test(id)) return { error: "Nota no válida." };
    const r = await supabase.from("ia_conocimiento").delete().eq("id", id).eq("tenant_id", tenantId);
    if (r.error) return { error: "No se pudo borrar." };
    revalidatePath("/configuracion/ia");
    return { mensaje: "Borrada" };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}
