import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import NuevoPaciente from "./nuevo-paciente";
import EliminarPaciente from "./eliminar-paciente";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let query = supabase
    .from("pacientes")
    .select("id, nombre, rut, telefono")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.or(`nombre.ilike.%${q}%,rut.ilike.%${q}%`);

  const [{ data: pacientes }, perfilRes] = await Promise.all([
    query,
    supabase.from("users").select("rol").eq("id", user!.id).single(),
  ]);

  // Bodega no ve fichas clínicas (RLS, migración de permisos por rol): sin
  // avisarlo, la lista simplemente sale vacía y parece que se perdieron los
  // pacientes en vez de ser una restricción de permisos.
  const rol = perfilRes.data?.rol ?? "";
  const puedeVerFichas = ["admin", "clinico", "ventas"].includes(rol);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Pacientes</h1>
        <form className="flex gap-2" action="/pacientes">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Buscar por nombre o RUT…"
            className="w-48 rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:w-64"
          />
          <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
            Buscar
          </button>
        </form>
      </div>

      {puedeVerFichas ? (
        <NuevoPaciente />
      ) : (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          Tu rol es <b>{rol}</b>, que no tiene acceso a las fichas clínicas de los pacientes (es
          una restricción de la base de datos, por tratarse de datos de salud). Para ver y cargar
          pacientes necesitas rol Administrador, Clínico o Ventas.
        </p>
      )}

      {!pacientes || pacientes.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          {q ? `Sin resultados para “${q}”.` : "Todavía no hay pacientes registrados."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pacientes.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-xl bg-crema-claro shadow-sm transition hover:bg-white">
              <Link href={`/pacientes/${p.id}`} className="flex flex-1 items-center gap-3 px-4 py-3">
                <span className="flex-1 truncate font-medium">{p.nombre}</span>
                <span className="text-sm text-tinta-suave">{formatearRut(p.rut)}</span>
                <span className="hidden text-sm text-tinta-suave sm:inline">
                  {formatearTelefono(p.telefono)}
                </span>
              </Link>
              {puedeVerFichas && (
                <div className="pr-2">
                  <EliminarPaciente pacienteId={p.id} nombre={p.nombre} compacto />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
