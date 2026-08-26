"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { actualizarPaciente } from "@/lib/actions/pacientes";
import { CampoFechaNacimiento, CampoRut, CampoTelefono } from "@/components/campos";

type Paciente = {
  id: string;
  nombre: string;
  rut: string | null;
  telefono: string | null;
  email: string | null;
  fecha_nacimiento: string | null;
};

export default function EditarPaciente({ paciente }: { paciente: Paciente }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">✎ Editar datos del paciente</summary>
      <form
        action={async (formData) => {
          setGuardando(true);
          setError(null);
          const resultado = await actualizarPaciente(formData);
          setGuardando(false);
          if (resultado.ok) router.refresh();
          else setError(resultado.error);
        }}
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <input type="hidden" name="paciente_id" value={paciente.id} />
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Nombre completo *
          <input name="nombre" required defaultValue={paciente.nombre} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          RUT
          <CampoRut name="rut" defaultValue={paciente.rut} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Teléfono
          <CampoTelefono name="telefono" defaultValue={paciente.telefono} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Email
          <input name="email" type="email" defaultValue={paciente.email ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Fecha de nacimiento
          <CampoFechaNacimiento name="fecha_nacimiento" defaultValue={paciente.fecha_nacimiento} />
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
            {guardando ? "Guardando…" : "Guardar datos"}
          </button>
        </div>
      </form>
    </details>
  );
}
