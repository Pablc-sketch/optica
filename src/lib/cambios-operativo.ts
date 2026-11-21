import comunas from "@/lib/comunas-chile.json";

// Cambios a un operativo que el asistente puede PROPONER. Se aplican solo
// cuando el administrador presiona «Aplicar» dentro de Lentia, y se vuelven
// a validar en el servidor (nunca se confía en lo que manda el navegador ni
// en lo que escribe la IA). Fechas, equipo y ventas no se cambian por acá.

export const COSTOS = [
  "costo_transporte", "costo_arriendo", "costo_viaticos", "costo_comida", "costo_hospedaje",
  "costo_equipos", "costo_peajes", "costo_ayudante", "costo_otros",
] as const;

export const ETIQUETAS: Record<string, string> = {
  nombre: "Nombre", direccion: "Dirección", comuna: "Comuna", region: "Región", hora_inicio: "Hora de inicio",
  hora_fin: "Hora de término", meta_examenes: "Meta de examinados", sectores: "Sectores que cubre", estado: "Estado",
  costo_transporte: "Transporte / combustible", costo_arriendo: "Arriendo del lugar", costo_viaticos: "Viáticos",
  costo_comida: "Comida", costo_hospedaje: "Hospedaje", costo_equipos: "Equipos", costo_peajes: "Peajes",
  costo_ayudante: "Ayudante", costo_otros: "Otros gastos",
};

export const CAMPOS_EDITABLES = ["nombre", "direccion", "comuna", "hora_inicio", "hora_fin", "meta_examenes", "sectores", "estado", ...COSTOS] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];
export type Cambios = Partial<Record<CampoEditable | "region", string | number | null>>;

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const COMUNAS = comunas as { nombre: string; region: string }[];

export function buscarComuna(nombre: string): { nombre: string; region: string } | null {
  const n = sinTildes(nombre);
  return COMUNAS.find((c) => sinTildes(c.nombre) === n) ?? null;
}

// Devuelve los cambios limpios o el primer error en palabras simples.
export function validarCambios(entrada: unknown): { cambios: Cambios } | { error: string } {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return { error: "No hay cambios." };
  const cambios: Cambios = {};
  for (const [campo, valor] of Object.entries(entrada as Record<string, unknown>)) {
    if (!(CAMPOS_EDITABLES as readonly string[]).includes(campo)) return { error: `«${campo}» no se puede cambiar desde el asistente.` };
    if ((COSTOS as readonly string[]).includes(campo) || campo === "meta_examenes") {
      const n = typeof valor === "string" ? Number(valor.replace(/[^\d]/g, "")) : valor;
      const max = campo === "meta_examenes" ? 2000 : 99_999_999;
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > max) return { error: `${ETIQUETAS[campo]}: debe ser un número entero entre 0 y ${max.toLocaleString("es-CL")}.` };
      cambios[campo as CampoEditable] = n;
    } else if (campo === "hora_inicio" || campo === "hora_fin") {
      if (valor === null || valor === "") { cambios[campo] = null; continue; }
      const t = typeof valor === "string" ? valor.trim().slice(0, 5) : "";
      if (!HORA.test(t)) return { error: `${ETIQUETAS[campo]}: escribe la hora como 09:30.` };
      cambios[campo] = t;
    } else if (campo === "estado") {
      if (!["planificado", "realizado", "cancelado"].includes(String(valor))) return { error: "Estado: planificado, realizado o cancelado." };
      cambios.estado = String(valor);
    } else if (campo === "comuna") {
      const c = typeof valor === "string" ? buscarComuna(valor) : null;
      if (!c) return { error: `No encontré la comuna «${String(valor)}».` };
      cambios.comuna = c.nombre;
      cambios.region = c.region;
    } else {
      const max = campo === "nombre" ? 160 : campo === "direccion" ? 250 : 500;
      const t = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
      if (campo === "nombre" && t.length < 2) return { error: "El nombre no puede quedar vacío." };
      if (t.length > max) return { error: `${ETIQUETAS[campo]}: máximo ${max} caracteres.` };
      cambios[campo as CampoEditable] = t || null;
    }
  }
  if (cambios.hora_inicio && cambios.hora_fin && String(cambios.hora_fin) <= String(cambios.hora_inicio)) {
    return { error: "La hora de término debe ser después de la de inicio." };
  }
  if (Object.keys(cambios).length === 0) return { error: "No hay cambios." };
  return { cambios };
}

export type Propuesta = {
  operativo_id: string;
  operativo: string;
  cambios: Cambios;
  antes: Cambios;
  motivo: string;
};
