"use server";

// Personal, equipos, kits y operativos con su equipo humano y kits.
// Todo pasa por RLS con la sesión del administrador: la base decide qué
// es de qué óptica y garantiza que nadie quede reservado dos veces.
import { revalidatePath } from "next/cache";
import { requerirPerfil, SinPermiso } from "@/lib/autorizacion";
import type { ResultadoAgenda } from "@/lib/actions/agenda-terreno";
import { CATEGORIAS_COSTO, FUNCIONES, leerFormularioOperativo } from "@/lib/equipo";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  return requerirPerfil({ roles: ["admin"], suscripcion: true });
}

function refrescar() {
  revalidatePath("/equipo");
  revalidatePath("/operativos", "layout");
}

// Mensaje para la pantalla: los de la base ya vienen en castellano y dicen
// qué recurso está ocupado y dónde; el resto se resume.
function mensajeDeError(error: { code?: string; message?: string } | null, porDefecto: string): string {
  if (!error) return porDefecto;
  if (error.code === "23P01") {
    return error.message?.includes("ya está reservado") ? error.message : "Un recurso ya está reservado en esas fechas.";
  }
  if (error.code === "22023" || error.code === "23514" || error.code === "42501") return error.message ?? porDefecto;
  if (error.code === "23505") return "Ya existe un registro con ese nombre o código.";
  return porDefecto;
}

async function conAdmin(f: (ctx: Awaited<ReturnType<typeof admin>>) => Promise<ResultadoAgenda>): Promise<ResultadoAgenda> {
  try {
    return await f(await admin());
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    throw e;
  }
}

export async function guardarPersona(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const id = String(datos.get("id") ?? "");
    const nombre = String(datos.get("nombre") ?? "").trim();
    const telefono = String(datos.get("telefono") ?? "").trim() || null;
    const funciones = FUNCIONES.map((f) => f.valor).filter((f) => datos.get(`funcion_${f}`) === "on");
    const activo = datos.get("activo") !== "off";
    if (!nombre || nombre.length > 100 || funciones.length === 0 || (id && !UUID.test(id))) {
      return { error: "Escribe el nombre y marca al menos una función." };
    }
    const fila = { nombre, telefono, funciones, activo };
    const { error } = await (id
      ? supabase.from("personal").update(fila).eq("id", id).eq("tenant_id", tenantId).select("id").single()
      : supabase.from("personal").insert(fila).select("id").single());
    if (error) return { error: mensajeDeError(error, "No se pudo guardar la persona.") };
    refrescar();
    return { mensaje: "Guardado" };
  });
}

export async function guardarEquipo(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const id = String(datos.get("id") ?? "");
    const nombre = String(datos.get("nombre") ?? "").trim();
    const tipo = String(datos.get("tipo") ?? "").trim();
    const codigo = String(datos.get("codigo") ?? "").trim();
    const activo = datos.get("activo") !== "off";
    if (!nombre || !tipo || !codigo || nombre.length > 100 || tipo.length > 60 || codigo.length > 60 || (id && !UUID.test(id))) {
      return { error: "Completa nombre, tipo y código del equipo." };
    }
    const fila = { nombre, tipo, codigo, activo };
    const { error } = await (id
      ? supabase.from("equipos").update(fila).eq("id", id).eq("tenant_id", tenantId).select("id").single()
      : supabase.from("equipos").insert(fila).select("id").single());
    if (error) return { error: mensajeDeError(error, "No se pudo guardar el equipo.") };
    refrescar();
    return { mensaje: "Guardado" };
  });
}

export async function guardarKit(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase }) => {
    const id = String(datos.get("id") || crypto.randomUUID());
    const nombre = String(datos.get("nombre") ?? "").trim();
    const equipos = datos.getAll("equipo").map(String).filter((x) => UUID.test(x));
    if (!UUID.test(id) || !nombre) return { error: "Escribe el nombre del kit." };
    const { error } = await supabase.rpc("guardar_kit", {
      p: { id, nombre, activo: datos.get("activo") !== "off", equipos },
    });
    if (error) return { error: mensajeDeError(error, "No se pudo guardar el kit.") };
    refrescar();
    return { mensaje: "Guardado" };
  });
}

// Crear o editar un operativo con su personal y kits, todo junto.
export async function guardarOperativoConEquipo(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase }) => {
    const entrada = leerFormularioOperativo(datos);
    if ("error" in entrada) return { error: entrada.error };
    const { error } = await supabase.rpc("guardar_operativo_equipo", { p: entrada });
    if (error) return { error: mensajeDeError(error, "No se pudo guardar el operativo.") };
    refrescar();
    return { href: `/operativos/organizar?id=${entrada.id}&ok=1` };
  });
}

// Presupuesto y gasto real por categoría. Vacío en "real" = todavía no se sabe.
export async function guardarCostosOperativo(datos: FormData): Promise<ResultadoAgenda> {
  return conAdmin(async ({ supabase, tenantId }) => {
    const operativoId = String(datos.get("operativo_id") ?? "");
    if (!UUID.test(operativoId)) return { error: "Operativo inválido." };
    const monto = (v: FormDataEntryValue | null) => {
      const t = String(v ?? "").replace(/[^\d]/g, "");
      return t === "" ? null : Number(t);
    };
    const filas = CATEGORIAS_COSTO.map((c) => ({
      tenant_id: tenantId,
      operativo_id: operativoId,
      categoria: c.valor,
      presupuesto: monto(datos.get(`presupuesto_${c.valor}`)) ?? 0,
      real: monto(datos.get(`real_${c.valor}`)),
    }));
    const { error } = await supabase.from("operativo_costos").upsert(filas, { onConflict: "operativo_id,categoria" });
    if (error) return { error: mensajeDeError(error, "No se pudieron guardar los costos.") };
    refrescar();
    return { mensaje: "Costos guardados" };
  });
}
