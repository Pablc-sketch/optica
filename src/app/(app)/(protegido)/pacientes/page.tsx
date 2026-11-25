import CabeceraPagina from "@/components/cabecera-pagina";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { hoyEnChile } from "@/lib/fechas";
import { edadPaciente } from "@/lib/datos-paciente";
import NuevoPaciente from "./nuevo-paciente";
import AtencionEnPagina from "./atencion-en-pagina";
import { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";
import EliminarPaciente from "./eliminar-paciente";

export default async function PacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string; op?: string; modo?: string }>;
}) {
  const { q, pagina: entradaPagina, op, modo } = await searchParams;
  const pagina = Math.max(1,Math.min(10000,Number.parseInt(entradaPagina ?? "1",10) || 1));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const LIMITE = 50;
  let query = supabase
    .from("pacientes")
    .select("id, nombre, rut, telefono, fecha_nacimiento, email", { count: "exact" })
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

  const puedeAtender = rol === "admin" || rol === "clinico";
  const enTerreno = puedeAtender && Boolean(op || modo === "terreno");
  const hoy = hoyEnChile();
  const paginaDePacientes = (numero: number) => {
    const parametros = new URLSearchParams({ pagina: String(numero) });
    if (q) parametros.set("q", q);
    if (enTerreno) parametros.set("modo", "terreno");
    if (op) parametros.set("op", op);
    return `/pacientes?${parametros}`;
  };
  const [cotizar, operativos] = enTerreno && user ? await Promise.all([
    cargarCatalogoParaCotizar(supabase).catch(() => null),
    supabase.from("operativos").select("id,nombre").in("estado", ["planificado", "realizado"]).is("archivado_en", null)
      .order("fecha", { ascending: false }).limit(50),
  ]) : [null, null];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CabeceraPagina seccion="Atención" titulo="Pacientes" />
        <div className="flex flex-wrap items-center gap-2">
          {puedeAtender && <Link href={enTerreno ? "/pacientes" : "/pacientes?modo=terreno"} className="rounded-lg border border-tinta/20 bg-white px-3 py-2 text-sm font-semibold">
            {enTerreno ? "Volver a pacientes" : "Atención en terreno"}
          </Link>}
          <form className="flex flex-wrap gap-2" action="/pacientes">
            {enTerreno && <input type="hidden" name="modo" value="terreno" />}
            {op && <input type="hidden" name="op" value={op} />}
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

      {puedeAtender ? (
        cotizar && operativos && user ? <AtencionEnPagina usuarioId={user.id} pacientes={pacientes ?? []}
          operativos={operativos.data ?? []} operativoId={op} cotizar={cotizar} puedeVender={rol === "admin"} hoy={hoy} />
          : <NuevoPaciente />
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
          {pacientes.map((p) => {
            const edad = puedeAtender ? edadPaciente(p.fecha_nacimiento, hoy) : null;
            const datos = [formatearRut(p.rut), edad === null ? null : `${edad} años`, formatearTelefono(p.telefono)]
              .filter(Boolean).join(" · ");
            const href = `/pacientes/${p.id}${op ? `?${new URLSearchParams({ op })}` : ""}`;
            return <li key={p.id} className="flex items-center gap-1 rounded-xl bg-crema-claro shadow-sm transition hover:bg-white">
              <Link href={href} className="min-w-0 flex-1 px-4 py-3">
                <span className="block break-words font-medium">{p.nombre}</span>
                {datos && <span className="block text-sm text-tinta-suave">{datos}</span>}
              </Link>
              {puedeAtender && (
                <div className="pr-2"><EliminarPaciente pacienteId={p.id} nombre={p.nombre} compacto /></div>
              )}
            </li>;
          })}
        </ul>
        <nav aria-label="Páginas de pacientes" className="flex justify-between gap-3 text-sm">
          {pagina > 1 ? <Link href={paginaDePacientes(pagina - 1)} className="rounded-xl border bg-white px-4 py-2">Anterior</Link> : <span />}
          {(totalPacientes ?? 0) > pagina*LIMITE && <Link href={paginaDePacientes(pagina + 1)} className="rounded-xl border bg-white px-4 py-2">Siguiente</Link>}
        </nav>
        </>
      )}
    </div>
  );
}
