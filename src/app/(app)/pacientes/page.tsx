import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearPaciente } from "@/lib/actions/pacientes";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("pacientes")
    .select("id, nombre, rut, telefono")
    .order("created_at", { ascending: false })
    .limit(50);
  if (q) query = query.or(`nombre.ilike.%${q}%,rut.ilike.%${q}%`);

  const { data: pacientes } = await query;

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

      <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo paciente</summary>
        <form action={crearPaciente} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            Nombre completo *
            <input name="nombre" required className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            RUT
            <input name="rut" placeholder="12.345.678-9" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Teléfono
            <input name="telefono" type="tel" inputMode="tel" placeholder="+56 9 …" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email
            <input name="email" type="email" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha de nacimiento
            <input name="fecha_nacimiento" type="date" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
              Guardar paciente
            </button>
          </div>
        </form>
      </details>

      {!pacientes || pacientes.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          {q ? `Sin resultados para “${q}”.` : "Todavía no hay pacientes registrados."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pacientes.map((p) => (
            <li key={p.id}>
              <Link
                href={`/pacientes/${p.id}`}
                className="flex items-center gap-3 rounded-xl bg-crema-claro px-4 py-3 shadow-sm transition hover:bg-white"
              >
                <span className="flex-1 truncate font-medium">{p.nombre}</span>
                <span className="text-sm text-tinta-suave">{p.rut ?? ""}</span>
                <span className="hidden text-sm text-tinta-suave sm:inline">{p.telefono ?? ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
