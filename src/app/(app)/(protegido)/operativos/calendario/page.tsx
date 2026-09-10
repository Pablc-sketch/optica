import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import {
  diasQueOcupa,
  fechaLegible,
  hoyEnChile,
  mesDesplazado,
  mesEnChile,
  nombreMes,
  rangoHorario,
  semanasDelMes,
} from "@/lib/fechas";

// Calendario del mes: para armar la agenda de varios operativos —
// especialmente cuando el mismo día hay dos sedes ("Los Molles sede
// Huaquén de 10 a 13" y después "sede Pullalli de 16 a 18"). La lista
// ordenada por fecha sirve para mirar hacia atrás, pero no para
// planificar: no deja ver qué fines de semana quedan libres ni cuándo se
// van a juntar dos puntos.
//
// El mes va en la URL (?mes=2026-10) en vez de en estado del navegador,
// así se puede guardar el link de octubre y volver a él.

const TIPOS_VENUE: Record<string, string> = {
  condominio: "Condominio",
  junta_vecinos: "Junta de vecinos",
  apr: "APR",
  colegio: "Colegio",
  sala_cuna: "Sala cuna",
  supermercado: "Supermercado",
  otro: "Otro",
};

const DIAS_SEMANA = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Un color por estado: planificado es lo que todavía se puede mover,
// realizado es historia y cancelado queda apagado para que no compita por
// la atención pero tampoco desaparezca (sirve saber que ese día se cayó).
const COLOR_ESTADO: Record<string, string> = {
  planificado: "bg-sky-600 text-white",
  realizado: "bg-green-600 text-white",
  cancelado: "bg-neutral-300 text-neutral-600 line-through",
};

function mesValido(valor: string | undefined): string {
  return /^\d{4}-\d{2}$/.test(valor ?? "") ? (valor as string) : mesEnChile();
}

export default async function CalendarioOperativos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesParam } = await searchParams;
  const mes = mesValido(mesParam);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfilRes.data?.rol !== "admin") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Calendario de operativos</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica organiza los operativos.
        </p>
      </div>
    );
  }

  // Se traen todos y se filtran en memoria: son decenas, no miles, y un
  // operativo de varios días puede empezar el mes anterior y seguir en
  // este — filtrarlo en la consulta por fecha del mes lo dejaría fuera.
  const [{ data: operativos }, { data: recetas }, { data: ventas }] = await Promise.all([
    supabase
      .from("operativos")
      .select(
        "id, nombre, fecha, fecha_fin, hora_inicio, hora_fin, tipo_venue, direccion, estado, meta_examenes, meta_ventas"
      )
      .order("fecha", { ascending: true }),
    supabase.from("recetas").select("operativo_id, paciente_id").not("operativo_id", "is", null),
    supabase
      .from("ventas")
      .select("operativo_id, total")
      .eq("anulada", false)
      .not("operativo_id", "is", null),
  ]);

  // Gente atendida contada por persona: alguien con dos recetas del mismo
  // operativo (lejos y cerca) es un paciente, no dos.
  const examinadosPorOperativo = new Map<string, Set<string>>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id || !r.paciente_id) continue;
    if (!examinadosPorOperativo.has(r.operativo_id)) examinadosPorOperativo.set(r.operativo_id, new Set());
    examinadosPorOperativo.get(r.operativo_id)!.add(r.paciente_id);
  }
  const vendidoPorOperativo = new Map<string, number>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    vendidoPorOperativo.set(v.operativo_id, (vendidoPorOperativo.get(v.operativo_id) ?? 0) + v.total);
  }

  const conDatos = (operativos ?? []).map((o) => ({
    ...o,
    dias: diasQueOcupa(o.fecha, o.fecha_fin),
    horario: rangoHorario(o.hora_inicio, o.hora_fin),
    examinados: examinadosPorOperativo.get(o.id)?.size ?? 0,
    vendido: vendidoPorOperativo.get(o.id) ?? 0,
  }));

  // Qué cae en cada día del mes. Dentro del día se ordenan por hora, que
  // es justo el caso de dos sedes seguidas; los que no tienen hora quedan
  // al final, porque no se sabe dónde calzan.
  const porDia = new Map<string, typeof conDatos>();
  for (const o of conDatos) {
    for (const dia of o.dias) {
      if (!dia.startsWith(mes)) continue;
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia)!.push(o);
    }
  }
  for (const lista of porDia.values()) {
    lista.sort((a, b) => (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"));
  }

  const delMes = conDatos
    .filter((o) => o.dias.some((d) => d.startsWith(mes)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.hora_inicio ?? "99").localeCompare(b.hora_inicio ?? "99"));

  const activos = delMes.filter((o) => o.estado !== "cancelado");
  const semanas = semanasDelMes(mes);
  const hoy = hoyEnChile();

  // Lo que se espera del mes según las metas ya cargadas en cada
  // operativo, para que planificar octubre no sea solo "cuántos días
  // salgo" sino "cuánto tendría que dejar".
  const metaExamenes = activos.reduce((s, o) => s + (o.meta_examenes ?? 0), 0);
  const metaVentas = activos.reduce((s, o) => s + (o.meta_ventas ?? 0), 0);
  const examinadosDelMes = activos.reduce((s, o) => s + o.examinados, 0);
  const vendidoDelMes = activos.reduce((s, o) => s + o.vendido, 0);
  const diasConOperativo = new Set(activos.flatMap((o) => o.dias.filter((d) => d.startsWith(mes)))).size;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/operativos" className="text-xs font-medium text-sky-700 hover:underline">
          ← Todos los operativos
        </Link>
        <h1 className="mt-1 text-xl font-bold">Calendario de operativos</h1>
        <p className="text-sm text-tinta-suave">
          Para agendar varios puntos en el mes y ver de un vistazo qué días quedan libres.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link
            href={`/operativos/calendario?mes=${mesDesplazado(mes, -1)}`}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
          >
            ←
          </Link>
          <h2 className="min-w-44 text-center text-lg font-bold text-sky-950 capitalize">{nombreMes(mes)}</h2>
          <Link
            href={`/operativos/calendario?mes=${mesDesplazado(mes, 1)}`}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
          >
            →
          </Link>
        </div>
        {mes !== mesEnChile() && (
          <Link href="/operativos/calendario" className="text-sm font-medium text-sky-700 hover:underline">
            Volver a este mes
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-sky-50 p-3">
          <p className="text-xs text-sky-800">Puntos agendados</p>
          <p className="text-xl font-bold text-sky-950">{activos.length}</p>
          <p className="text-xs text-sky-700">
            en {diasConOperativo} día{diasConOperativo === 1 ? "" : "s"} del mes
          </p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-3">
          <p className="text-xs text-sky-800">Gente atendida</p>
          <p className="text-xl font-bold text-sky-950">{examinadosDelMes}</p>
          <p className="text-xs text-sky-700">{metaExamenes > 0 ? `meta ${metaExamenes}` : "sin metas cargadas"}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-3">
          <p className="text-xs text-sky-800">Vendido</p>
          <p className="text-xl font-bold text-sky-950">{clp(vendidoDelMes)}</p>
          <p className="text-xs text-sky-700">{metaVentas > 0 ? `meta ${clp(metaVentas)}` : "sin metas cargadas"}</p>
        </div>
        <div className="rounded-2xl bg-sky-50 p-3">
          <p className="text-xs text-sky-800">Falta para la meta</p>
          <p className="text-xl font-bold text-sky-950">
            {metaVentas > 0 ? clp(Math.max(0, metaVentas - vendidoDelMes)) : "—"}
          </p>
          <p className="text-xs text-sky-700">
            {metaVentas > 0 && vendidoDelMes >= metaVentas ? "meta cumplida 🎉" : "según lo agendado"}
          </p>
        </div>
      </div>

      {/* La grilla se hace angosta en el celular, así que va con scroll
          horizontal en vez de apretar siete columnas en 360px. */}
      <div className="overflow-x-auto">
        <div className="min-w-160">
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-sky-800">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {semanas.map((semana, i) => (
              <div key={i} className="grid grid-cols-7 gap-1">
                {semana.map((dia, j) => {
                  if (!dia) return <div key={j} className="min-h-24 rounded-xl bg-crema-claro/40" />;
                  const delDia = porDia.get(dia) ?? [];
                  const esHoy = dia === hoy;
                  const finDeSemana = j >= 5;
                  return (
                    <div
                      key={j}
                      className={`min-h-24 rounded-xl border p-1.5 ${
                        esHoy
                          ? "border-sky-500 bg-sky-50 ring-2 ring-sky-200"
                          : finDeSemana
                            ? "border-sky-100 bg-sky-50/40"
                            : "border-neutral-200 bg-white"
                      }`}
                    >
                      <p className={`text-xs font-semibold ${esHoy ? "text-sky-800" : "text-tinta-suave"}`}>
                        {Number(dia.slice(8))}
                      </p>
                      <div className="mt-1 flex flex-col gap-1">
                        {delDia.map((o) => (
                          <Link
                            key={o.id}
                            href={`/operativos/${o.id}`}
                            title={`${o.nombre}${o.horario ? ` · ${o.horario}` : ""}${o.direccion ? ` · ${o.direccion}` : ""}`}
                            className={`block rounded-lg px-1.5 py-1 text-[11px] leading-tight font-medium transition hover:opacity-85 ${
                              COLOR_ESTADO[o.estado] ?? "bg-sky-600 text-white"
                            }`}
                          >
                            {o.horario && <span className="block font-bold">{o.horario}</span>}
                            <span className="block">{o.nombre}</span>
                            {/* En un operativo de varios días conviene ver
                                en qué día del punto se está parado. */}
                            {o.dias.length > 1 && (
                              <span className="block opacity-80">
                                día {o.dias.indexOf(dia) + 1} de {o.dias.length}
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Agenda del mes</h2>
        {delMes.length === 0 ? (
          <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
            No hay operativos agendados en {nombreMes(mes)}.{" "}
            <Link href="/operativos" className="font-medium underline">
              Agendar uno
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {delMes.map((o) => {
              const faltanExamenes = (o.meta_examenes ?? 0) - o.examinados;
              return (
                <li key={o.id} className="rounded-2xl border border-sky-100 bg-sky-50 p-3">
                  <Link href={`/operativos/${o.id}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-medium text-sky-950">{o.nombre}</span>
                    <span className="text-sm text-sky-800">
                      {fechaLegible(o.fecha)}
                      {o.dias.length > 1 && ` al ${fechaLegible(o.dias[o.dias.length - 1])}`}
                      {o.horario && ` · ${o.horario}`}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        o.estado === "planificado"
                          ? "bg-sky-200 text-sky-900"
                          : o.estado === "realizado"
                            ? "bg-green-100 text-green-800"
                            : "bg-neutral-200 text-neutral-600"
                      }`}
                    >
                      {o.estado}
                    </span>
                  </Link>
                  <p className="mt-0.5 text-xs text-sky-700">
                    {[o.tipo_venue ? TIPOS_VENUE[o.tipo_venue] ?? o.tipo_venue : null, o.direccion]
                      .filter(Boolean)
                      .join(" · ") || "Sin dirección cargada"}
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-800">
                    <span className="rounded-full bg-white px-2 py-0.5">
                      👥 {o.examinados} atendido{o.examinados === 1 ? "" : "s"}
                      {o.meta_examenes ? ` de ${o.meta_examenes}` : ""}
                    </span>
                    {o.vendido > 0 && <span className="rounded-full bg-white px-2 py-0.5">💰 {clp(o.vendido)}</span>}
                    {o.estado === "planificado" && faltanExamenes > 0 && o.meta_examenes && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">
                        faltan {faltanExamenes} para la meta
                      </span>
                    )}
                    {!o.horario && o.estado === "planificado" && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900">sin hora definida</span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
