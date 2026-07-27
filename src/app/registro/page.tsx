"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatearRut } from "@/lib/rut";

export default function RegistroPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    optica: "",
    rut: "",
    nombre: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  function set(campo: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [campo]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setCargando(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
    });
    if (signUpError) {
      // Un mensaje genérico obliga a adivinar; cada causa tiene arreglo distinto.
      const codigo = (signUpError as { code?: string }).code ?? "";
      const texto = signUpError.message.toLowerCase();

      setError(
        texto.includes("already registered") || codigo === "user_already_exists"
          ? "Ese correo ya tiene una cuenta. Inicia sesión."
          : codigo === "over_email_send_rate_limit" || texto.includes("rate limit")
            ? "El servicio de correo alcanzó su límite por hora. Espera un rato o desactiva la confirmación por correo en Supabase (Authentication → Sign In / Providers → Email)."
            : texto.includes("invalid")
              ? "El correo no es válido. Revísalo e intenta de nuevo."
              : `No se pudo crear la cuenta: ${signUpError.message}`
      );
      setCargando(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("crear_optica", {
      p_nombre_comercial: form.optica,
      p_rut_empresa: formatearRut(form.rut),
      p_nombre_usuario: form.nombre,
    });
    if (rpcError) {
      setError(rpcError.message);
      setCargando(false);
      return;
    }

    // El token emitido al registrarse todavía no trae tenant_id (el perfil
    // se creó después). Refrescamos para que el hook lo inyecte; sin esto
    // RLS bloquea todas las consultas de la óptica recién creada.
    await supabase.auth.refreshSession();

    router.push("/");
    router.refresh();
  }

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Image src="/logo.svg" alt="" width={72} height={72} className="rounded-3xl shadow-sm" priority />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Registra tu óptica</h1>
            <p className="text-sm text-tinta-suave">30 días de prueba, sin tarjeta.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-2xl bg-crema-claro p-6 shadow-sm">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Nombre de la óptica *
            <input required value={form.optica} onChange={set("optica")} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            RUT de la empresa
            <input
              value={form.rut}
              onChange={(e) => setForm((f) => ({ ...f, rut: formatearRut(e.target.value) }))}
              placeholder="77.123.456-7"
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tu nombre *
            <input required value={form.nombre} onChange={set("nombre")} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correo *
            <input required type="email" autoComplete="email" value={form.email} onChange={set("email")} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Contraseña * <span className="font-normal text-tinta-suave">(mínimo 8 caracteres)</span>
            <input required type="password" autoComplete="new-password" value={form.password} onChange={set("password")} className={input} />
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={cargando}
            className="mt-2 rounded-lg bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {cargando ? "Creando tu óptica…" : "Crear mi óptica"}
          </button>

          <p className="text-center text-sm text-tinta-suave">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-semibold text-brand hover:underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
