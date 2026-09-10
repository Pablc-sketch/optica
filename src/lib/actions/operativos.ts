"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearTelefono } from "@/lib/formato";

const TIPOS_VENUE = [
  "condominio",
  "junta_vecinos",
  "apr",
  "colegio",
  "sala_cuna",
  "supermercado",
  "otro",
] as const;

// Mismo patrón que requerirAdmin() en configuracion.ts: el tenant y el rol
// se toman de la base, nunca del formulario, así que no se puede crear un
// operativo en otra óptica manipulando el HTML.
async function requerirAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("users").select("tenant_id, rol").eq("id", user.id).single();
  if (!perfil || perfil.rol !== "admin") {
    throw new Error("Solo el administrador de la óptica puede crear operativos");
  }
  return { supabase, tenantId: perfil.tenant_id as string };
}

// Si viene una fecha de término anterior a la de inicio (dato mal
// tipeado), se ignora en vez de guardar un rango invertido — mejor
// "sin fecha de término" que un rango que no tiene sentido.
function parsearFechaFin(valor: FormDataEntryValue | null, fechaInicio: string): string | null {
  const fechaFin = String(valor ?? "").trim();
  if (!fechaFin || fechaFin < fechaInicio) return null;
  return fechaFin;
}

// Hora del punto de atención ("10:00"). Vacío es válido y significa "sin
// hora todavía": el calendario lo muestra igual, solo que sin horario.
function parsearHora(valor: FormDataEntryValue | null): string | null {
  const hora = String(valor ?? "").trim();
  return /^\d{2}:\d{2}/.test(hora) ? hora : null;
}

export async function crearOperativo(formData: FormData) {
  const { supabase, tenantId } = await requerirAdmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!nombre || !fecha) return;

  const tipoVenue = String(formData.get("tipo_venue") ?? "");

  const { data: creado, error } = await supabase
    .from("operativos")
    .insert({
      tenant_id: tenantId,
      nombre,
      fecha,
      fecha_fin: parsearFechaFin(formData.get("fecha_fin"), fecha),
      hora_inicio: parsearHora(formData.get("hora_inicio")),
      hora_fin: parsearHora(formData.get("hora_fin")),
      tipo_venue: (TIPOS_VENUE as readonly string[]).includes(tipoVenue) ? tipoVenue : null,
      direccion: String(formData.get("direccion") ?? "").trim() || null,
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Quien consiguió el lugar es el primer dirigente de su agenda. Se anota
  // acá, al crear, porque es el único momento en que ese dato está fresco
  // — después nadie vuelve a entrar a llenarlo.
  const contactoNombre = String(formData.get("contacto_nombre") ?? "").trim();
  if (creado && contactoNombre) {
    const { error: contactoError } = await supabase.from("contactos_operativo").insert({
      tenant_id: tenantId,
      operativo_id: creado.id,
      nombre: contactoNombre,
      cargo: String(formData.get("contacto_cargo") ?? "").trim() || null,
      telefono: formatearTelefono(String(formData.get("contacto_telefono") ?? "")) || null,
    });
    if (contactoError) throw contactoError;
  }

  revalidatePath("/operativos");
  revalidatePath("/operativos/calendario");
  revalidatePath("/operativos/contactos");
}

// Corregir nombre, fechas o lugar después de creado (ej. "OPV Departamento
// Pudahuel" que en verdad dura varios días, o se cambió la dirección) — sin
// esto había que borrar y crear todo de nuevo. Los dirigentes ya no se
// editan acá: viven en su propia agenda, porque son varios por lugar.
export async function actualizarOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();
  if (!id || !nombre || !fecha) return;

  const tipoVenue = String(formData.get("tipo_venue") ?? "");

  const { error } = await supabase
    .from("operativos")
    .update({
      nombre,
      fecha,
      fecha_fin: parsearFechaFin(formData.get("fecha_fin"), fecha),
      hora_inicio: parsearHora(formData.get("hora_inicio")),
      hora_fin: parsearHora(formData.get("hora_fin")),
      fecha_entrega_estimada: String(formData.get("fecha_entrega_estimada") ?? "").trim() || null,
      tipo_venue: (TIPOS_VENUE as readonly string[]).includes(tipoVenue) ? tipoVenue : null,
      direccion: String(formData.get("direccion") ?? "").trim() || null,
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/operativos");
  revalidatePath("/operativos/calendario");
  revalidatePath("/ventas");
}

export async function cambiarEstadoOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const estado = String(formData.get("estado") ?? "");
  if (!id || !["planificado", "realizado", "cancelado"].includes(estado)) return;

  const { error } = await supabase.from("operativos").update({ estado }).eq("id", id);
  if (error) throw error;

  revalidatePath("/operativos");
  revalidatePath("/operativos/calendario");
}

function parsearMonto(valor: FormDataEntryValue | null): number {
  const n = Math.round(Number(String(valor ?? "").replace(/\./g, "")));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

// Vacío = sin meta (no se muestra barra de progreso), a diferencia de los
// costos donde vacío es 0.
function parsearMetaOpcional(valor: FormDataEntryValue | null): number | null {
  const texto = String(valor ?? "").replace(/\./g, "").trim();
  if (!texto) return null;
  const n = Math.round(Number(texto));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Costos reales del operativo (para ver utilidad neta), metas del día
// (examenes/monto, opcionales) y los datos de la entrega — se editan
// juntos desde el detalle porque todo esto es "planificación" del
// operativo, no algo que se cargue al crear.
export async function actualizarDetallesOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { error } = await supabase
    .from("operativos")
    .update({
      costo_transporte: parsearMonto(formData.get("costo_transporte")),
      costo_arriendo: parsearMonto(formData.get("costo_arriendo")),
      costo_viaticos: parsearMonto(formData.get("costo_viaticos")),
      costo_otros: parsearMonto(formData.get("costo_otros")),
      meta_examenes: parsearMetaOpcional(formData.get("meta_examenes")),
      meta_ventas: parsearMetaOpcional(formData.get("meta_ventas")),
      meta_utilidad: parsearMetaOpcional(formData.get("meta_utilidad")),
      // Hora y lugar de la entrega: texto libre a propósito ("10:00 a
      // 12:00", "Sede central del condominio"), porque es lo que se copia
      // tal cual al WhatsApp de recordatorio y cada operativo lo dice a su
      // manera.
      hora_entrega: String(formData.get("hora_entrega") ?? "").trim() || null,
      lugar_entrega: String(formData.get("lugar_entrega") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/operativos");
  revalidatePath("/operativos/calendario");
  revalidatePath("/operativos/comparar");
}

const BASES_COMISION = ["venta_total", "utilidad_neta"] as const;

function parsearPorcentaje(valor: FormDataEntryValue | null, porDefecto: number): number {
  const n = Number(String(valor ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) return porDefecto;
  return n;
}

// Cómo se reparte la plata de este operativo entre Isadora (comisión),
// ahorro del negocio y el resto dividido entre la mamá y Pablo. Vive en
// el operativo (no en un ajuste global) para que cambiar el criterio hacia
// adelante no le mueva el piso a lo ya repartido en operativos pasados.
export async function actualizarSueldosOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const base = String(formData.get("comision_vendedora_base") ?? "");

  const { error } = await supabase
    .from("operativos")
    .update({
      comision_vendedora_pct: parsearPorcentaje(formData.get("comision_vendedora_pct"), 10),
      comision_vendedora_base: (BASES_COMISION as readonly string[]).includes(base) ? base : "venta_total",
      ahorro_pct: parsearPorcentaje(formData.get("ahorro_pct"), 20),
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/reportes");
}

// La agenda de dirigentes de cada operativo: con quién hay que hablar
// para volver a ese lugar. Son varios por lugar (presidente,
// administradora, la señora que abre la sede) y cambian de cargo entre un
// operativo y el siguiente, así que cada uno es su propia ficha en vez de
// un campo único que haya que pisar.
export async function crearContactoOperativo(formData: FormData) {
  const { supabase, tenantId } = await requerirAdmin();
  const operativoId = String(formData.get("operativo_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!operativoId || !nombre) return;

  const { error } = await supabase.from("contactos_operativo").insert({
    tenant_id: tenantId,
    operativo_id: operativoId,
    nombre,
    cargo: String(formData.get("cargo") ?? "").trim() || null,
    telefono: formatearTelefono(String(formData.get("telefono") ?? "")) || null,
    email: String(formData.get("email") ?? "").trim() || null,
    notas: String(formData.get("notas") ?? "").trim() || null,
  });
  if (error) throw error;

  revalidatePath(`/operativos/${operativoId}`);
  revalidatePath("/operativos/contactos");
}

export async function actualizarContactoOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const operativoId = String(formData.get("operativo_id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!id || !nombre) return;

  const { error } = await supabase
    .from("contactos_operativo")
    .update({
      nombre,
      cargo: String(formData.get("cargo") ?? "").trim() || null,
      telefono: formatearTelefono(String(formData.get("telefono") ?? "")) || null,
      email: String(formData.get("email") ?? "").trim() || null,
      notas: String(formData.get("notas") ?? "").trim() || null,
    })
    .eq("id", id);
  if (error) throw error;

  if (operativoId) revalidatePath(`/operativos/${operativoId}`);
  revalidatePath("/operativos/contactos");
}

export async function eliminarContactoOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const operativoId = String(formData.get("operativo_id") ?? "");
  if (!id) return;

  const { error } = await supabase.from("contactos_operativo").delete().eq("id", id);
  if (error) throw error;

  if (operativoId) revalidatePath(`/operativos/${operativoId}`);
  revalidatePath("/operativos/contactos");
}

// Cada cuántos meses conviene volver a este lugar. Se guarda aparte de los
// demás datos del operativo porque se ajusta desde la agenda de contactos
// —donde se está pensando en volver— y no al corregir la fecha o la
// dirección.
export async function actualizarCadenciaOperativo(formData: FormData) {
  const { supabase } = await requerirAdmin();
  const id = String(formData.get("id") ?? "");
  const meses = Math.round(Number(String(formData.get("volver_en_meses") ?? "")));
  if (!id || !Number.isFinite(meses) || meses < 1 || meses > 60) return;

  const { error } = await supabase.from("operativos").update({ volver_en_meses: meses }).eq("id", id);
  if (error) throw error;

  revalidatePath(`/operativos/${id}`);
  revalidatePath("/operativos/contactos");
}
