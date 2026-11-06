"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { correoDeAcceso } from "@/lib/piloto-terreno";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: correoDeAcceso(email),
      password,
    });

    if (signInError) {
      setError("Usuario o contraseña incorrectos.");
      setCargando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-md md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex items-center gap-4 bg-sidebar px-6 py-5 text-white sm:px-8 md:flex-col md:items-start md:justify-between md:py-9">
          <Image src="/logo.svg" alt="" width={60} height={60} className="size-12 rounded-xl md:size-15" priority />
          <div>
            <p className="text-2xl font-bold tracking-tight sm:text-3xl">Lentia</p>
            <p className="text-sm text-sidebar-text">Gestión de ópticas</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6 sm:p-8">
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Inicia sesión</h1>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correo o usuario
            <input
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Contraseña
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
            />
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
            {cargando ? "Ingresando…" : "Ingresar"}
          </button>

          <p className="text-center text-sm text-tinta-suave">
            ¿Tu óptica todavía no está registrada?{" "}
            <Link href="/registro" className="font-semibold text-brand hover:underline">
              Crea tu cuenta
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
