import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import NuevoPaciente from "./nuevo-paciente";
import EliminarPaciente from "./eliminar-paciente";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina: entradaPagina } = await searchParams;
  const pagina = Math.max(1,Math.min(10000,Number.parseInt(entradaPagina ?? "1",10) || 1));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const LIMITE = 50;
  let query = supabase
    .from("pacientes")
    .select("id, nombre, rut, telefono", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id").range((pagina-1)*LIMITE,pagina*LIMITE-1);
  // Comas y paréntesis tienen significado dentro del filtro .or() de
  // PostgREST: se sacan del texto buscado para que no cambien la consulta.
  const texto = (q ?? "").slice(0,80).replace(/[,()*%\\]/g, " ").trim();
  if (/^[0-9.kK\s-]{7,20}$/.test(texto)) {
    const limpio = texto.replace(/[^0-9kK]/g, '').toUpperCase();
    if (limpio.length >= 7) {
      const variantes = [...new Set([limpio, formatearRut(limpio), `${limpio.slice(0,-1)}-${limpio.slice(-1)}`])];
      query = query.or(variantes.map(r => `rut.eq.${r}`).join(','));
    } else query = query.ilike('rut', `%${texto}%`);
  } else if (texto) query = query.or(`nombre.ilike.%${texto}%,rut.ilike.%${texto}%`);

  const [{ data: pacientes, count: totalPacientes, error: errorPacientes }, perfilRes] = await Promise.all([
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
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-2" action="/pacientes">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              aria-label="Nombre o RUT del paciente"
              maxLength={80}
              placeholder="Nombre o RUT"
              className="w-48 rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-sm outline-none focus:border-brand sm:w-64"
            />
            <button className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark">
              Buscar
            </button>
          </form>
        </div>
      </div>

      {["admin", "clinico"].includes(rol) ? (
        <NuevoPaciente />
      ) : !puedeVerFichas && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          Tu rol no tiene acceso a las fichas de pacientes. Consulta al administrador.
        </p>
      )}

      {errorPacientes ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">No se pudieron cargar los pacientes. Vuelve a intentar.</p> : !pacientes || pacientes.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          {q ? `Sin resultados para “${q}”.` : "Todavía no hay pacientes registrados."}
        </p>
      ) : (
        <>
        {(totalPacientes ?? 0) > pacientes.length && (
          <p className="text-xs text-tinta-suave">
            {totalPacientes} pacientes · página {pagina}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {pacientes.map((p) => (
            <li key={p.id} className="flex items-center gap-1 rounded-xl bg-crema-claro shadow-sm transition hover:bg-white">
              <Link href={`/pacientes/${p.id}`} className="flex flex-1 items-center gap-3 px-4 py-3">
                <span className="flex-1 min-w-0 break-words font-medium">{p.nombre}</span>
                <span className="text-sm text-tinta-suave">{formatearRut(p.rut)}</span>
                <span className="hidden text-sm text-tinta-suave sm:inline">
                  {formatearTelefono(p.telefono)}
                </span>
              </Link>
              {["admin", "clinico"].includes(rol) && (
                <div className="pr-2">
                  <EliminarPaciente pacienteId={p.id} nombre={p.nombre} compacto />
                </div>
              )}
            </li>
          ))}
        </ul>
        <nav aria-label="Páginas de pacientes" className="flex justify-between gap-3 text-sm">
          {pagina > 1 ? <Link href={`/pacientes?${new URLSearchParams({q:q ?? "",pagina:String(pagina-1)})}`} className="rounded-xl border bg-white px-4 py-2">Anterior</Link> : <span />}
          {(totalPacientes ?? 0) > pagina*LIMITE && <Link href={`/pacientes?${new URLSearchParams({q:q ?? "",pagina:String(pagina+1)})}`} className="rounded-xl border bg-white px-4 py-2">Siguiente</Link>}
        </nav>
        </>
      )}
    </div>
  );
}
