"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { fechaAgendaValida, rangoAgendaValido, RUTA_AGENDA, urlAgenda } from "@/lib/agenda";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function guardarAgenda(
  edicion: boolean, _: { error?: string }, form: FormData,
): Promise<{ error?: string }> {
  try {
    const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
    const id = text(form, "id");
    const tipo = text(form, "tipo");
    const fecha = text(form, "fecha");
    const fechaFin = tipo === "disponible" ? fecha : text(form, "fecha_fin") || fecha;
    const inicio = text(form, "hora_inicio");
    const fin = text(form, "hora_fin");
    const nombre = text(form, "nombre");
    const optica = text(form, "optica");
    const estado = tipo === "disponible" ? "confirmado" : text(form, "estado");
    const direccion = text(form, "direccion");
    const notas = text(form, "notas");
    if (!UUID.test(id) || !["propio", "externo", "disponible"].includes(tipo)
      || !["pendiente", "confirmado", "cancelado"].includes(estado)) {
      return { error: "Revisa el tipo y el estado del registro." };
    }
    if (!rangoAgendaValido(fecha, fechaFin, inicio, fin)) {
      return { error: "Revisa las fechas y horas. La hora de término debe ser posterior a la de inicio." };
    }
    if ((tipo !== "disponible" && !nombre) || (tipo === "externo" && !optica)) {
      return { error: "Completa el nombre del operativo y la óptica si corresponde." };
    }
    if (nombre.length > 160 || optica.length > 160 || direccion.length > 250 || notas.length > 2000) {
      return { error: "Acorta el nombre, el lugar o las notas." };
    }
    const horario = { fecha, fecha_fin: fechaFin === fecha ? null : fechaFin, hora_inicio: inicio, hora_fin: fin };
    const detalles = { nombre, direccion: direccion || null, notas: notas || null };
    const propios = supabase.from("operativos");
    const bloques = supabase.from("agenda_bloques");
    const propio = { ...horario, ...detalles, estado: estado === "cancelado" ? estado : "planificado", agenda_confirmado: estado === "confirmado" };
    const bloque = { ...horario, estado, tipo, ...detalles, optica: optica || null };
    const operacion = tipo === "propio"
      ? edicion
        ? propios.update(propio).eq("id", id).eq("tenant_id", tenantId).in("estado", ["planificado", "cancelado"])
        : propios.insert({ ...propio, id, tenant_id: tenantId })
      : edicion
        ? bloques.update(bloque).eq("id", id).eq("tenant_id", tenantId).eq("tipo", tipo)
        : bloques.insert({ ...bloque, id, tenant_id: tenantId });
    const { data, error } = await operacion.select("id").maybeSingle();
    if (error?.code === "23P01") {
      return { error: tipo === "disponible"
        ? "Ya hay un bloque de disponibilidad en ese horario."
        : "Cruce de horario con otro operativo. Elige otro bloque o corrige el compromiso existente." };
    }
    if (error?.code === "23505" && !edicion) {
      const existente = tipo === "propio"
        ? await propios.select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle()
        : await bloques.select("id").eq("id", id).eq("tenant_id", tenantId).eq("tipo", tipo).maybeSingle();
      if (!existente.data) return { error: "No se pudo guardar. Vuelve a intentar." };
    } else if (error || !data) {
      return { error: edicion ? "No se pudo actualizar este registro." : "No se pudo guardar. Vuelve a intentar." };
    }
    revalidatePath("/");
    revalidatePath("/operativos");
    revalidatePath("/operativos/calendario");
    revalidatePath(RUTA_AGENDA);
    if (tipo === "propio") revalidatePath(`/operativos/${id}`);
    redirect(urlAgenda(fecha, { guardado: "1" }));
  } catch (error) {
    if (error instanceof SinPermiso) return { error: error.message };
    throw error;
  }
}

export async function borrarDisponibilidad(form: FormData) {
  const { supabase, tenantId } = await requerirPerfil({ roles: ["admin"], suscripcion: true });
  const id = text(form, "id");
  const fecha = text(form, "fecha");
  if (!UUID.test(id) || !fechaAgendaValida(fecha)) redirect(RUTA_AGENDA);
  const { error } = await supabase.from("agenda_bloques").delete()
    .eq("id", id).eq("tenant_id", tenantId).eq("tipo", "disponible").eq("fecha", fecha);
  revalidatePath("/");
  revalidatePath(RUTA_AGENDA);
  redirect(urlAgenda(fecha, error ? { error: "borrar" } : {}));
}
