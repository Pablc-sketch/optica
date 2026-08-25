import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";

// Seguimiento de operativos: pacientes a los que se les tomó un examen en
// un operativo pero todavía no compraron nada — para que ventas los pueda
// llamar y cerrar la venta, en vez de que el examen quede perdido en la
// ficha sin que nadie se entere.

type Receta = {
  id: string;
  fecha: string;
  paciente_id: string;
  pacientes: { nombre: string; rut: string | null; telefono: string | null } | { nombre: string; rut: string | null; telefono: string | null }[] | null;
};

function uno<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default async function SeguimientoPage({
  searchParams,
}: {
  searchParams: Promise<{ operativo_id?: string }>;
}) {
  const { operativo_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  const rol = perfilRes.data?.rol ?? "";
  // Mismo control que /pacientes: son datos de fichas clínicas (quién se
  // hizo qué examen), bodega no debe verlos.
  const puedeVerFichas = ["admin", "clinico", "ventas"].includes(rol);

  if (!puedeVerFichas) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Seguimiento de operativos</h1>
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          Tu rol es <b>{rol}</b>, que no tiene acceso a las fichas clínicas de los pacientes. Para
          ver esta pantalla necesitas rol Administrador, Clínico o Ventas.
        </p>
      </div>
    );
  }

  const { data: operativos } = await supabase
    .from("operativos")
    .select("id, nombre, fecha")
    .order("fecha", { ascending: false });

  const operativoId = operativo_id || operativos?.[0]?.id || "";

  let pendientes: {
    recetaId: string;
    pacienteId: string;
    nombre: string;
    rut: string | null;
    telefono: string | null;
    fecha: string;
  }[] = [];

  if (operativoId) {
    const [recetasRes, ventasRes] = await Promise.all([
      supabase
        .from("recetas")
        .select("id, fecha, paciente_id, pacientes:paciente_id (nombre, rut, telefono)")
        .eq("operativo_id", operativoId)
        .order("fecha", { ascending: false }),
      // paciente_id con al menos una venta, sea de este operativo o de
      // cualquier otro: si ya compró, ya no es un pendiente de seguimiento.
      supabase.from("ventas").select("paciente_id").not("paciente_id", "is", null),
    ]);

    const recetas = (recetasRes.data ?? []) as unknown as Receta[];
    const conVenta = new Set((ventasRes.data ?? []).map((v) => v.paciente_id as string));

    pendientes = recetas
      .filter((r) => !conVenta.has(r.paciente_id))
      .map((r) => {
        const paciente = uno(r.pacientes);
        return {
          recetaId: r.id,
          pacienteId: r.paciente_id,
          nombre: paciente?.nombre ?? "—",
          rut: paciente?.rut ?? null,
          telefono: paciente?.telefono ?? null,
          fecha: r.fecha,
        };
      });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Seguimiento de operativos</h1>
        {operativos && operativos.length > 0 && (
          <form className="flex items-center gap-2" action="/pacientes/seguimiento">
            <select
              name="operativo_id"
              defaultValue={operativoId}
              className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand"
            >
              {operativos.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre} — {fechaLegible(o.fecha)}
                </option>
              ))}
            </select>
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Ver
            </button>
          </form>
        )}
      </div>

      {!operativos || operativos.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Todavía no hay operativos creados. Se crean desde la pantalla Operativos.
        </p>
      ) : pendientes.length === 0 ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Sin exámenes pendientes de compra en este operativo — todos los pacientes examinados ya
          tienen alguna venta registrada.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {pendientes.map((p) => (
            <li key={p.recetaId} className="rounded-xl bg-crema-claro px-4 py-3 shadow-sm transition hover:bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/pacientes/${p.pacienteId}`} className="font-medium hover:underline">
                  {p.nombre}
                </Link>
                <span className="text-xs text-tinta-suave">{fechaLegible(p.fecha)}</span>
              </div>
              <p className="text-sm text-tinta-suave">
                {[formatearRut(p.rut) || null, formatearTelefono(p.telefono) || null]
                  .filter(Boolean)
                  .join(" · ") || "Sin datos de contacto"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
