"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { crearUsuario } from "@/lib/actions/configuracion";

const ROLES = [
  { valor: "admin", etiqueta: "Administrador", ayuda: "Acceso total, incluida la configuración" },
  { valor: "clinico", etiqueta: "Clínico", ayuda: "Pacientes y recetas; ve ventas sin editarlas" },
  { valor: "ventas", etiqueta: "Ventas", ayuda: "Vende y cobra; ve las fichas sin editarlas" },
  { valor: "bodega", etiqueta: "Bodega", ayuda: "Solo inventario y taller; no ve fichas clínicas" },
];

export default function NuevoUsuario() {
  const router = useRouter();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [rol, setRol] = useState("ventas");

  async function accion(formData: FormData) {
    setGuardando(true);
    setMensaje(null);
    const resultado = await crearUsuario(formData);
    setGuardando(false);
    if (resultado.ok) {
      setMensaje("✓ Usuario creado");
      router.refresh();
    } else {
      setMensaje(resultado.error ?? "No se pudo crear el usuario.");
    }
  }

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
      <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo usuario</summary>
      <form action={accion} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre *
          <input name="nombre" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Correo *
          <input name="email" type="email" required className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Contraseña inicial *
          <input name="password" type="text" required minLength={8} placeholder="mínimo 8 caracteres" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Rol
          <select name="rol" value={rol} onChange={(e) => setRol(e.target.value)} className={input}>
            {ROLES.map((r) => (
              <option key={r.valor} value={r.valor}>{r.etiqueta}</option>
            ))}
          </select>
        </label>

        <p className="text-xs text-tinta-suave sm:col-span-2">
          {ROLES.find((r) => r.valor === rol)?.ayuda}
        </p>

        {mensaje && (
          <p className={`text-sm font-medium sm:col-span-2 ${mensaje.startsWith("✓") ? "text-green-700" : "text-red-700"}`}>
            {mensaje}
          </p>
        )}

        <div className="sm:col-span-2">
          <button
            disabled={guardando}
            className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {guardando ? "Creando…" : "Crear usuario"}
          </button>
        </div>
      </form>
    </details>
  );
}
