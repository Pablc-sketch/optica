import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { crearOperativo, cambiarEstadoOperativo } from "@/lib/actions/operativos";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import { clp } from "@/lib/clp";
import { CampoTelefono } from "@/components/campos";
import { cargarPendientes } from "@/lib/resumen-pendientes";
import { leerTodas } from "@/lib/leer-todas";
import BotonEnviar from "@/components/boton-enviar";

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

  if (!user) return null;
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

  const [opsRes, recetasRes, ventasRes, contactosRes, pendientesRes] = await Promise.all([
    leerTodas((a, b) => supabase
      .from("operativos")
      .select(
        "id, nombre, tipo_venue, fecha, direccion, estado, notas"
      )
      .order("fecha", { ascending: false }).order("id").range(a, b)),
    leerTodas((a, b) => supabase.from("recetas").select("id, operativo_id").not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase
      .from("ventas")
      .select(
        `id, operativo_id, total, pagos_abonos (monto),
         venta_items (ordenes_trabajo:ot_id (id, estado))`
      )
      .eq("anulada", false)
      .not("operativo_id", "is", null).order("id").range(a, b)),
    leerTodas((a, b) => supabase
      .from("contactos_operativo")
      .select("id, operativo_id, nombre, cargo, telefono")
      .order("created_at", { ascending: true }).order("id").range(a, b)),
    cargarPendientes(supabase),
  ]);

  const errorLectura = opsRes.error ?? recetasRes.error ?? ventasRes.error ?? contactosRes.error ?? pendientesRes.error;
  if (errorLectura) return <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron leer los operativos. Recarga; los pendientes no están confirmados.</p>;
  const operativos = opsRes.data;
  const recetas = recetasRes.data;
  const ventas = ventasRes.data;
  const contactos = contactosRes.data;
  const pagosPorOperativo = new Map(pendientesRes.resumen.operativos.map((o) => [o.operativoId, o]));
  // Un vistazo de cómo le fue a cada operativo sin tener que entrar: cuántos
  // exámenes, cuántas ventas y cuánto se vendió — se arma en memoria en vez
  // de una consulta por operativo.
  const examenesPorOperativo = new Map<string, number>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id) continue;
    examenesPorOperativo.set(r.operativo_id, (examenesPorOperativo.get(r.operativo_id) ?? 0) + 1);
  }
  // El primer dirigente anotado de cada lugar, para verlo sin entrar. El
  // resto vive en la agenda: en la lista solo estorbarían.
  const contactoPorOperativo = new Map<string, { nombre: string; cargo: string | null; telefono: string | null }>();
  const cuantosContactos = new Map<string, number>();
  for (const c of contactos ?? []) {
    cuantosContactos.set(c.operativo_id, (cuantosContactos.get(c.operativo_id) ?? 0) + 1);
    if (!contactoPorOperativo.has(c.operativo_id)) contactoPorOperativo.set(c.operativo_id, c);
  }
  const ventasPorOperativo = new Map<string, { cantidad: number; total: number }>();
  // Lo que sigue pendiente de cada operativo: lentes sin entregar y plata
  // sin cobrar. Un operativo sin nada pendiente ya está terminado.
  const pendientePorOperativo = new Map<string, { lentes: Set<string>; saldo: number }>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    const actual = ventasPorOperativo.get(v.operativo_id) ?? { cantidad: 0, total: 0 };
    actual.cantidad += 1;
    actual.total += v.total;
    ventasPorOperativo.set(v.operativo_id, actual);

    const pend = pendientePorOperativo.get(v.operativo_id) ?? { lentes: new Set<string>(), saldo: 0 };
    pend.saldo += Math.max(0, v.total - (v.pagos_abonos ?? []).reduce((a: number, p: { monto: number }) => a + p.monto, 0));
    for (const item of v.venta_items ?? []) {
      const rel = (item as { ordenes_trabajo?: { id: string; estado: string } | { id: string; estado: string }[] | null }).ordenes_trabajo;
      const ot = Array.isArray(rel) ? rel[0] : rel;
      if (ot && !["entregado", "cancelado"].includes(ot.estado)) pend.lentes.add(ot.id);
    }
    pendientePorOperativo.set(v.operativo_id, pend);
  }

  const lista = operativos ?? [];
  const pendiente = (id: string) => pendientePorOperativo.get(id) ?? { lentes: new Set<string>(), saldo: 0 };
  // Activos: los que se están por hacer, y los ya hechos que todavía tienen
  // lentes por entregar o plata por cobrar. Terminado = nada pendiente.
  const terminado = (o: (typeof lista)[number]) =>
    (o.estado === "cancelado" || o.estado === "realizado") && pendiente(o.id).lentes.size === 0 && pendiente(o.id).saldo === 0 && !pagosPorOperativo.has(o.id);
  const activos = lista
    .filter((o) => !terminado(o))
    .sort((a, b) => Number(a.estado !== "planificado") - Number(b.estado !== "planificado") || a.fecha.localeCompare(b.fecha));
  const terminados = lista.filter(terminado);

  const input =
    "rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand";

  const botonEstado = (o: (typeof lista)[number]) =>
    o.estado !== "cancelado" && (
      <form action={cambiarEstadoOperativo} className="flex items-center gap-1">
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="estado" value={o.estado === "planificado" ? "realizado" : "cancelado"} />
        <button className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-xs font-medium transition hover:bg-white">
          {o.estado === "planificado" ? "Marcar realizado" : "Cancelar"}
        </button>
      </form>
    );

  // Operativo activo: color vivo, con lo que falta (lentes por entregar y
  // plata por cobrar).
  const tarjetaActiva = (o: (typeof lista)[number]) => {
    const examenes = examenesPorOperativo.get(o.id) ?? 0;
    const venta = ventasPorOperativo.get(o.id);
    const contacto = contactoPorOperativo.get(o.id);
    const pend = pendiente(o.id);
    const pagos = pagosPorOperativo.get(o.id);
    const planificado = o.estado === "planificado";
    return (
      <li
        key={o.id}
        className={`rounded-2xl border-2 p-4 shadow-sm ${planificado ? "border-sky-500 bg-sky-50" : "border-emerald-600 bg-emerald-50"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/operativos/${o.id}`} className="flex-1">
            <p className="text-lg font-bold text-tinta">{o.nombre}</p>
            <p className="text-sm text-tinta-suave">
              {[fechaLegible(o.fecha), TIPOS_VENUE.find((t) => t.valor === o.tipo_venue)?.etiqueta, o.direccion].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-bold">
              <span className={`rounded-full px-2.5 py-1 ${planificado ? "bg-sky-600 text-white" : "bg-emerald-700 text-white"}`}>
                {ESTADOS[o.estado] ?? o.estado}
              </span>
              {pend.lentes.size > 0 && (
                <span className="rounded-full bg-amber-400 px-2.5 py-1 text-amber-950">
                  {pend.lentes.size} {pend.lentes.size === 1 ? "orden" : "órdenes"} por entregar
                </span>
              )}
              {pend.saldo > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-white">Falta cobrar {clp(pend.saldo)}</span>}
              {pagos && pagos.total > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-950">Por pagar {clp(pagos.total)}</span>}
              {pagos && pagos.ahorro > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-emerald-800">Ahorro por separar</span>}
              {examenes > 0 && <span className="rounded-full bg-white px-2.5 py-1 text-tinta">{examenes} examinados</span>}
              {venta && <span className="rounded-full bg-white px-2.5 py-1 text-tinta">{clp(venta.total)} vendido</span>}
            </p>
            {contacto && (
              <p className="mt-1 text-xs text-tinta-suave">
                📇 {[contacto.nombre, contacto.cargo, formatearTelefono(contacto.telefono)].filter(Boolean).join(" · ")}
                {(cuantosContactos.get(o.id) ?? 0) > 1 && ` +${(cuantosContactos.get(o.id) ?? 0) - 1} más`}
              </p>
            )}
            {o.notas && <p className="mt-1 text-xs text-tinta-suave">{o.notas}</p>}
          </Link>
          {botonEstado(o)}
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Operativos</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/operativos/calendario" className="rounded-xl border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema">
            📅 Calendario
          </Link>
          <Link href="/operativos/contactos" className="rounded-xl border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema">
            📇 Dirigentes
          </Link>
          <Link href="/operativos/comparar" className="rounded-xl border-2 border-tinta/15 bg-white px-3.5 py-2 text-sm font-semibold hover:bg-crema">
            📊 Comparar
          </Link>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {activos.map(tarjetaActiva)}
          {lista.length === 0 && (
            <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">Todavía no hay operativos. Crea el primero abajo.</p>
          )}
          {lista.length > 0 && activos.length === 0 && (
            <p className="rounded-2xl bg-emerald-50 p-4 text-center font-semibold text-emerald-800">Nada pendiente ✓</p>
          )}
        </ul>

        {terminados.length > 0 && (
          <details className="rounded-2xl bg-neutral-100 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-500">Terminados ({terminados.length})</summary>
            <ul className="mt-2 flex flex-col gap-1.5">
              {terminados.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/operativos/${o.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl px-3 py-2 text-neutral-500 hover:bg-neutral-200"
                  >
                    <span className="font-medium">{o.nombre}</span>
                    <span className="text-xs">
                      {fechaLegible(o.fecha)}
                      {o.estado === "cancelado" && " · cancelado"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        <details className="rounded-2xl border border-sky-100 bg-sky-50 p-4 shadow-sm">
          <summary className="cursor-pointer font-semibold text-sky-800">＋ Nuevo operativo</summary>
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
              Fecha de término (si dura más de un día)
              <input type="date" name="fecha_fin" className={input} />
            </label>
            {/* La hora es lo que permite poner dos sedes el mismo día en el
                calendario, una después de la otra. Es opcional: un operativo
                sin hora igual aparece, solo que sin horario. */}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Hora de inicio
              <input type="time" name="hora_inicio" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Hora de término
              <input type="time" name="hora_fin" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirección
              <input name="direccion" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dirigente que consiguió el lugar
              <input name="contacto_nombre" placeholder="Luigino" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Su cargo
              <input name="contacto_cargo" placeholder="Presidente de la directiva" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Su teléfono
              <CampoTelefono name="contacto_telefono" className={input} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
              Notas
              <textarea name="notas" rows={2} className={input} />
            </label>
            <div className="sm:col-span-2">
              <BotonEnviar className="rounded-lg bg-sky-700 px-4 py-2.5 font-semibold text-white transition hover:bg-sky-800">
                Crear operativo
              </BotonEnviar>
            </div>
          </form>
        </details>
      </section>
    </div>
  );
}
