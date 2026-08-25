import { createClient } from "@/lib/supabase/server";
import { crearOperativo, cambiarEstadoOperativo } from "@/lib/actions/operativos";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import { CampoTelefono } from "@/components/campos";

const TIPOS_VENUE = [
  { valor: "condominio", etiqueta: "Condominio" },
  { valor: "junta_vecinos", etiqueta: "Junta de vecinos" },
  { valor: "apr", etiqueta: "APR" },
  { valor: "colegio", etiqueta: "Colegio" },
  { valor: "sala_cuna", etiqueta: "Sala cuna" },
  { valor: "supermercado", etiqueta: "Supermercado" },
  { valor: "otro", etiqueta: "Otro" },
];

const ESTADOS: Record<string, string> = {
  planificado: "Planificado",
  realizado: "Realizado",
  cancelado: "Cancelado",
};

export default async function OperativosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  const esAdmin = perfilRes.data?.rol === "admin";

  if (!esAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Operativos</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica maneja los operativos. Al cargar una venta o una
          receta igual vas a poder elegir a cuál corresponde.
        </p>
      </div>
    );
  }

  const { data: operativos } = await supabase
    .from("operativos")
    .select("id, nombre, tipo_venue, fecha, direccion, contacto_nombre, contacto_telefono, estado, notas")
    .order("fecha", { ascending: false });

  // Próximos (planificados) primero, ordenados por fecha más cercana;
  // realizados y cancelados después, más reciente arriba.
  const lista = operativos ?? [];
  const planificados = lista.filter((o) => o.estado === "planificado").sort((a, b) => a.fecha.localeCompare(b.fecha));
  const otros = lista.filter((o) => o.estado !== "planificado");

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Operativos</h1>

      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {[...planificados, ...otros].map((o) => (
            <li key={o.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {o.nombre}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                        o.estado === "planificado"
                          ? "bg-brand/15 text-brand-dark"
                          : o.estado === "realizado"
                            ? "bg-green-100 text-green-800"
                            : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {ESTADOS[o.estado] ?? o.estado}
                    </span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {[
                      fechaLegible(o.fecha),
                      TIPOS_VENUE.find((t) => t.valor === o.tipo_venue)?.etiqueta,
                      o.direccion,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {(o.contacto_nombre || o.contacto_telefono) && (
                    <p className="text-xs text-tinta-suave">
                      {[o.contacto_nombre, formatearTelefono(o.contacto_telefono)].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {o.notas && <p className="mt-1 text-xs text-tinta-suave">{o.notas}</p>}
                </div>
                {o.estado !== "cancelado" && (
                  <form action={cambiarEstadoOperativo} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={o.id} />
                    <input
                      type="hidden"
                      name="estado"
                      value={o.estado === "planificado" ? "realizado" : "cancelado"}
                    />
                    <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-xs font-medium transition hover:bg-white">
                      {o.estado === "planificado" ? "Marcar realizado" : "Cancelar"}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
          {lista.length === 0 && (
            <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
              Todavía no hay operativos creados.
            </p>
          )}
        </ul>

        <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nuevo operativo</summary>
          <form action={crearOperativo} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nombre *
              <input name="nombre" required placeholder="Colegio San José" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tipo de lugar
              <select name="tipo_venue" defaultValue="" className={input}>
                <option value="">— Sin especificar —</option>
                {TIPOS_VENUE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fecha *
              <input type="date" name="fecha" required className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirección
              <input name="direccion" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contacto
              <input name="contacto_nombre" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Teléfono de contacto
              <CampoTelefono name="contacto_telefono" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Notas
              <textarea name="notas" rows={2} className={input} />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white transition hover:bg-brand-dark">
                Crear operativo
              </button>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
