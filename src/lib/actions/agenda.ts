"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hoyEnChile } from "@/lib/fechas";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import { fechaAgendaValida, fechasAgendaValidas, filtroAgenda, horarioAgendaOpcionalValido, RUTA_AGENDA, urlAgenda } from "@/lib/agenda";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function guardarAgenda(
  edicion: boolean, _: { error?: string }, form: FormData,
): Promise<{ error?: string }> {
  try {
    const { supabase, rol } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
    const id = text(form, "id");
    const tipo = text(form, "tipo");
    const origen = text(form, "tipo_original") || tipo;
    const eliminar = text(form, "accion") === "eliminar";
    const vista: Record<string, string> = form.has("filtro") ? { filtro: filtroAgenda(text(form, "filtro")) } : {};
    if (edicion && (eliminar || origen !== tipo) && rol !== "admin") return { error: "Solo el administrador puede cambiar de óptica o eliminar. Puedes editar los datos o cancelar el operativo." };
    if (edicion && eliminar) {
      if (!UUID.test(id) || !["propio", "externo"].includes(origen)) return { error: "Revisa el registro a eliminar." };
      const { error } = await supabase.rpc("agenda_reclasificar", { p: { id, origen, destino: "eliminar" } });
      if (error) return { error: error.message };
      revalidatePath("/");
      revalidatePath("/operativos");
      revalidatePath("/operativos/calendario");
      revalidatePath(RUTA_AGENDA);
      revalidatePath(`/operativos/${id}`);
      redirect(urlAgenda(fechaAgendaValida(text(form, "fecha")) ? text(form, "fecha") : hoyEnChile(), { ...vista, eliminado: "1" }));
    }
    const fecha = text(form, "fecha");
    const fechaFin = text(form, "fecha_fin") || fecha;
    const inicio = text(form, "hora_inicio");
    const fin = text(form, "hora_fin");
    const nombre = text(form, "nombre");
    const optica = text(form, "optica");
    const estado = tipo === "disponible" ? "confirmado" : text(form, "estado");
    const direccion = text(form, "direccion");
    const notas = text(form, "notas");
    const comuna = text(form, "comuna");
    const region = text(form, "region");
    if (!UUID.test(id) || !["propio", "externo", "disponible"].includes(tipo)
      || !["pendiente", "confirmado", "cancelado"].includes(estado)) {
      return { error: "Revisa el tipo y el estado del registro." };
    }
    if (!fechasAgendaValidas(fecha, fechaFin)) {
      return { error: "Indica un rango de fechas válido de hasta un año." };
    }
    if (tipo === "propio" && !horarioAgendaOpcionalValido(inicio, fin)) {
      return { error: "La hora de término debe ser posterior a la de inicio." };
    }
    if ((tipo !== "disponible" && !nombre) || (tipo === "externo" && !optica)) {
      return { error: "Completa el nombre del operativo y la óptica si corresponde." };
    }
    if (nombre.length > 160 || optica.length > 160 || direccion.length > 250 || notas.length > 2000 || comuna.length > 80 || region.length > 100) {
      return { error: "Acorta el nombre, el lugar o las notas." };
    }
    if (edicion && origen !== tipo) {
      if (!["propio", "externo"].includes(origen) || !["propio", "externo"].includes(tipo)) return { error: "No se puede convertir este registro." };
      const { error } = await supabase.rpc("agenda_reclasificar", { p: {
        id, origen, destino: tipo, fecha, fecha_fin: fechaFin, nombre, optica, direccion, comuna, region, notas, estado,
        hora_inicio: inicio, hora_fin: fin,
      } });
      if (error) return { error: error.code === "23P01" ? "El rango se cruza con otro operativo. Revisa las fechas." : error.message };
      revalidatePath("/");
      revalidatePath("/operativos");
      revalidatePath("/operativos/calendario");
      revalidatePath(RUTA_AGENDA);
      revalidatePath(`/operativos/${id}`);
      redirect(urlAgenda(fecha, { ...vista, guardado: "1" }));
    }
    const { data, error } = await supabase.rpc("agenda_guardar", { p_edicion: edicion, p: {
      id, tipo, fecha, fecha_fin: fechaFin, hora_inicio: inicio, hora_fin: fin,
      nombre, optica, direccion, comuna, region, notas, estado,
    } });
    if (error) return { error: error.code === "23P01"
      ? "El rango se cruza con otro operativo. Revisa las fechas y horarios."
      : error.message || "No se pudo guardar. Vuelve a intentar." };
    if (!data) return { error: "No se pudo guardar. Vuelve a intentar." };
    revalidatePath("/");
    revalidatePath("/operativos");
    revalidatePath("/operativos/calendario");
    revalidatePath(RUTA_AGENDA);
    if (tipo === "propio") revalidatePath(`/operativos/${id}`);
    redirect(urlAgenda(fecha, { ...vista, guardado: "1" }));
  } catch (error) {
    if (error instanceof SinPermiso) return { error: error.message };
    throw error;
  }
}

export async function borrarDisponibilidad(form: FormData) {
  const { supabase } = await requerirPerfil({ roles: ["admin", "ventas"], suscripcion: true });
  const id = text(form, "id");
  const fecha = text(form, "fecha");
  if (!UUID.test(id) || !fechaAgendaValida(fecha)) redirect(RUTA_AGENDA);
  const { error } = await supabase.rpc("agenda_disponibilidad_borrar", { p_id: id, p_fecha: fecha });
  revalidatePath("/");
  revalidatePath(RUTA_AGENDA);
  redirect(urlAgenda(fecha, error ? { error: "borrar" } : {}));
}
