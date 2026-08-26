"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
      email,
      password,
    });

    if (signInError) {
      setError("Correo o contraseña incorrectos.");
      setCargando(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <Image src="/logo.svg" alt="Logo" width={88} height={88} className="rounded-3xl shadow-sm" priority />
          <div className="text-center">
            <h1 className="text-2xl font-bold">Lentia</h1>
            <p className="text-sm text-tinta-suave">Ingresa con tu cuenta</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl bg-crema-claro p-6 shadow-sm">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Correo
            <input
              type="email"
              required
              autoComplete="email"
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
