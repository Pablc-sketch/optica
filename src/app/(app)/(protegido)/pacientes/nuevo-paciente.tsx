"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearPaciente } from "@/lib/actions/pacientes";
import { CampoRut, CampoTelefono } from "@/components/campos";

export default function NuevoPaciente() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function accion(formData: FormData) {
    setGuardando(true);
    setError(null);
    const resultado = await crearPaciente(formData);
    setGuardando(false);
    if (resultado.ok) {
      router.push(`/pacientes/${resultado.id}`);
    } else {
      setError(resultado.error);
    }
  }

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo paciente</summary>
      <form action={accion} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <input name="fecha_nacimiento" type="date" className={input} />
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
