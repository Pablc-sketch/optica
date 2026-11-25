import { edadEnAnios } from "./fechas";
import { fechaCortaAISO, formatearTelefono } from "./formato";
import { formatearRut } from "./rut";

export type PacienteParaAtender = {
  id: string;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
};

export function pacienteDesdeFormulario(id: string, formulario: Pick<FormData, "get">): PacienteParaAtender {
  const valor = (campo: string) => String(formulario.get(campo) ?? "").trim();
  return {
    id,
    nombre: valor("nombre"),
    rut: formatearRut(valor("rut")) || null,
    telefono: formatearTelefono(valor("telefono")) || null,
    email: valor("email") || null,
    fecha_nacimiento: fechaCortaAISO(valor("fecha_nacimiento")),
  };
}

export function edadPaciente(nacimiento: string | null, hoy: string): number | null {
  if (!nacimiento || nacimiento > hoy) return null;
  const edad = edadEnAnios(nacimiento, hoy);
  return Number.isFinite(edad) ? edad : null;
}
