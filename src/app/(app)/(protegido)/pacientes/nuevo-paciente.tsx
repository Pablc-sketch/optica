"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { crearPaciente } from "@/lib/actions/pacientes";
import { encolarAtencion } from "@/lib/offline/atenciones";
import { pacienteDesdeFormulario, type PacienteParaAtender } from "@/lib/datos-paciente";
import { CampoFechaNacimiento, CampoRut, CampoTelefono } from "@/components/campos";

export default function NuevoPaciente({ usuarioId, alGuardar }: {
  usuarioId?: string; alGuardar?: (paciente: PacienteParaAtender) => void;
} = {}) {
  const router = useRouter();
  const intento = useRef("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function accion(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (guardando) return;
    const formData = new FormData(evento.currentTarget);
    setGuardando(true);
    setError(null);
    try {
      if (usuarioId && alGuardar) {
        intento.current ||= crypto.randomUUID();
        const paciente = pacienteDesdeFormulario(intento.current, formData);
        if (!paciente.nombre) {
          setError("Escribe el nombre del paciente.");
          return;
        }
        await encolarAtencion(usuarioId, "paciente", formData, paciente.id);
        intento.current = "";
        alGuardar(paciente);
        return;
      }
      const resultado = await crearPaciente(formData);
      if (resultado.ok) router.push(`/pacientes/${resultado.id}`);
      else setError(resultado.error);
    } catch {
      setError("No se pudo guardar el paciente. Revisa el almacenamiento o la conexión y vuelve a intentar.");
    } finally {
      setGuardando(false);
    }
  }

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo paciente</summary>
      <form onSubmit={accion} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Nombre completo *
          <input name="nombre" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          RUT
          <CampoRut name="rut" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Teléfono
          <CampoTelefono name="telefono" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input name="email" type="email" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Fecha de nacimiento
          <CampoFechaNacimiento name="fecha_nacimiento" />
        </label>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {guardando ? "Guardando…" : "Guardar paciente"}
          </button>
        </div>
      </form>
    </details>
  );
}
