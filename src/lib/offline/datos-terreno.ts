import type { VentaInput } from "@/lib/actions/ventas";
import { formatearRut } from "@/lib/rut";
import { leerSugerenciasExtra } from "@/lib/sugerencias";

export type TipoAtencion = "paciente" | "receta";
export type PacienteTerreno = { id: string; nombre: string; rut: string | null };
export type AtencionTerreno = {
  id: string;
  usuarioId: string;
  tipo: TipoAtencion;
  campos: Record<string, string>;
  creada: string;
  error?: string;
};
export type ResultadoTerreno = { ok: true } | { ok: false; error: string; transitorio?: boolean };
export type SolicitudTerreno = AtencionTerreno | { tipo: "venta"; venta: VentaInput; usuarioId: string };

export function textoReceta(form: Pick<FormData, "get">, campo: string) {
  return String(form.get(campo) ?? "").trim() || null;
}

export function numeroReceta(form: Pick<FormData, "get">, campo: string) {
  const valor = textoReceta(form, campo);
  return valor === null ? null : Number(valor.replace(",", "."));
}

export function sugerenciasTerreno(form: Pick<FormData, "get">) {
  const cantidad = Math.min(Number(form.get("extras_cantidad")) || 0, 4);
  return leerSugerenciasExtra(Array.from({ length: cantidad }, (_, i) => ({
    tipo_lente: textoReceta(form, `extra_tipo_${i}`),
    tratamiento: textoReceta(form, `extra_tratamiento_${i}`),
    posicion: textoReceta(form, `extra_posicion_${i}`),
  })));
}

export function resumenReceta(id: string, form: Pick<FormData, "get">) {
  const add = numeroReceta(form, "add");
  return {
    id, tipo: textoReceta(form, "tipo") ?? "lejos", operativo_id: textoReceta(form, "operativo_id"),
    od_esfera: numeroReceta(form, "od_esfera"), od_cilindro: numeroReceta(form, "od_cilindro"), od_add: add,
    oi_esfera: numeroReceta(form, "oi_esfera"), oi_cilindro: numeroReceta(form, "oi_cilindro"), oi_add: add,
    sugerencia_tipo_lente: textoReceta(form, "sugerencia_tipo_lente"),
    sugerencia_tratamiento: textoReceta(form, "sugerencia_tratamiento"),
    sugerencia_tipo_lente_cerca: textoReceta(form, "sugerencia_tipo_lente_cerca"),
    sugerencia_tratamiento_cerca: textoReceta(form, "sugerencia_tratamiento_cerca"),
    sugerencias_extra: sugerenciasTerreno(form),
  };
}

export type AtencionesParaVenta = { pacientes: PacienteTerreno[]; recetas: Record<string, ReturnType<typeof resumenReceta>> };

export function resumirAtenciones(atenciones: AtencionTerreno[]): AtencionesParaVenta {
  const pacientes: PacienteTerreno[] = [];
  const recetas: AtencionesParaVenta["recetas"] = {};
  for (const { id, tipo, campos, error } of atenciones) {
    if (error) continue;
    if (tipo === "paciente") {
      pacientes.push({ id, nombre: campos.nombre.trim(), rut: formatearRut(campos.rut) || null });
    } else {
      recetas[campos.paciente_id] = resumenReceta(id, { get: campo => campos[campo] ?? null });
    }
  }
  return { pacientes, recetas };
}
