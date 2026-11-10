import Link from "next/link";
import { notFound } from "next/navigation";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import { exigirRolPagina } from "@/lib/autorizacion";
import { guardarCostosOperativo, guardarOperativoConEquipo } from "@/lib/actions/equipo";
import { CATEGORIAS_COSTO, FUNCIONES, seCruzan, tramoOperativo } from "@/lib/equipo";
import { fechaLegible } from "@/lib/fechas";
import { clp } from "@/lib/clp";

// Crear o editar un operativo con su equipo humano y sus kits. La base
// impide reservar a la misma persona, kit o equipo en fechas que se
// cruzan; acá además se muestra dónde está comprometido cada uno.
const campo = "w-full rounded-xl border bg-white px-3 py-2.5 text-base";

type Op = { id: string; nombre: string; direccion: string | null; notas: string | null; fecha: string; fecha_fin: string | null; hora_inicio: string | null; hora_fin: string | null; estado: string };
type Reserva = { operativo_id: string; persona_id: string | null; funcion: string | null; kit_id: string | null; equipo_id: string | null; operativos: Op | Op[] | null };
type Costo = { categoria: string; presupuesto: number; real: number | null };

const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function OrganizarOperativo({ searchParams }: { searchParams: Promise<{ id?: string; ok?: string }> }) {
  const { supabase } = await exigirRolPagina(["admin"]);
  const { id, ok } = await searchParams;
  const [opRes, personasRes, kitsRes, reservasRes, costosRes] = await Promise.all([
    id
      ? supabase.from("operativos").select("id, nombre, direccion, notas, fecha, fecha_fin, hora_inicio, hora_fin, estado, costo_transporte, costo_arriendo, costo_viaticos, costo_ayudante, costo_equipos, costo_otros").eq("id", id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("personal").select("id, nombre, funciones").eq("activo", true).order("nombre"),
    supabase.from("kits").select("id, nombre, kit_equipos (equipos (id, nombre, codigo, activo))").eq("activo", true).order("nombre"),
    supabase
      .from("operativo_reservas")
      .select("operativo_id, persona_id, funcion, kit_id, equipo_id, operativos (id, nombre, direccion, notas, fecha, fecha_fin, hora_inicio, hora_fin, estado)")
      .eq("activo", true),
    id ? supabase.from("operativo_costos").select("categoria, presupuesto, real").eq("operativo_id", id) : Promise.resolve({ data: [], error: null }),
  ]);
  if (personasRes.error || kitsRes.error || reservasRes.error || opRes.error) throw new Error("No pudimos cargar el operativo");
  const op = opRes.data as (Op & Record<string, number | null>) | null;
  if (id && !op) notFound();

  const reservas = (reservasRes.data ?? []) as unknown as Reserva[];
  const propias = reservas.filter((r) => r.operativo_id === op?.id);
  const tramo = op ? tramoOperativo(op) : null;
  const hoy = new Date().toISOString().slice(0, 10);

  // Dónde está comprometido cada recurso: si se edita un operativo, los que
  // se cruzan con él; si es nuevo, los compromisos próximos.
  const compromisos = (filtro: (r: Reserva) => boolean) => {
    const vistos = new Map<string, Op>();
    for (const r of reservas) {
      const o = uno(r.operativos);
      if (!o || r.operativo_id === op?.id || !filtro(r)) continue;
      if (tramo ? !seCruzan(tramo, tramoOperativo(o)) : (o.fecha_fin ?? o.fecha) < hoy) continue;
      vistos.set(o.id, o);
    }
    return [...vistos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  };
  const textoCompromisos = (lista: Op[]) =>
    lista.slice(0, 3).map((o) => `${o.nombre} (${fechaLegible(o.fecha)})`).join(" · ") + (lista.length > 3 ? ` · +${lista.length - 3}` : "");

  const personas = (personasRes.data ?? []) as { id: string; nombre: string; funciones: string[] }[];
  const kits = (kitsRes.data ?? []) as unknown as { id: string; nombre: string; kit_equipos: { equipos: { id: string; nombre: string; codigo: string; activo: boolean } | null }[] }[];
  const costos = (costosRes.data ?? []) as Costo[];
  const columnaAntigua: Record<string, string> = {
    transporte: "costo_transporte", arriendo: "costo_arriendo", viaticos: "costo_viaticos",
    personal: "costo_ayudante", equipos: "costo_equipos", otros: "costo_otros",
  };
  const conHorario = Boolean(op?.hora_inicio && op?.hora_fin);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link href={op ? `/operativos/${op.id}` : "/operativos"} className="text-sm underline">← {op ? op.nombre : "Operativos"}</Link>
      <CabeceraPagina seccion="Operativos" titulo={op ? "Editar operativo" : "Nuevo operativo"} />
      {ok && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">Operativo guardado con su equipo.</p>}
      {op?.estado === "cancelado" && <p className="rounded-xl bg-neutral-100 p-3 text-sm">Este operativo está cancelado: sus reservas quedaron libres.</p>}

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <FormularioAgenda accion={guardarOperativoConEquipo} etiqueta={op ? "Guardar cambios" : "Crear operativo"}>
          <input type="hidden" name="id" value={op?.id ?? crypto.randomUUID()} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium sm:col-span-2">Nombre<input required name="nombre" defaultValue={op?.nombre ?? ""} maxLength={160} className={campo} /></label>
            <label className="text-sm font-medium">Fecha inicial<input required type="date" name="fecha" defaultValue={op?.fecha ?? ""} className={campo} /></label>
            <label className="text-sm font-medium">Fecha final (si dura más de un día)<input type="date" name="fecha_fin" defaultValue={op?.fecha_fin ?? ""} className={campo} /></label>
            <fieldset className="text-sm sm:col-span-2">
              <legend className="mb-1 font-medium">Jornada</legend>
              <label className="mr-4 inline-flex items-center gap-1.5"><input type="radio" name="jornada" value="completa" defaultChecked={!conHorario} /> Jornada completa</label>
              <label className="inline-flex items-center gap-1.5"><input type="radio" name="jornada" value="horario" defaultChecked={conHorario} /> Con horario</label>
            </fieldset>
            <label className="text-sm font-medium">Hora de inicio<input type="time" name="hora_inicio" defaultValue={op?.hora_inicio?.slice(0, 5) ?? ""} className={campo} /></label>
            <label className="text-sm font-medium">Hora de término<input type="time" name="hora_fin" defaultValue={op?.hora_fin?.slice(0, 5) ?? ""} className={campo} /></label>
            <label className="text-sm font-medium sm:col-span-2">Lugar<input name="direccion" defaultValue={op?.direccion ?? ""} maxLength={220} className={campo} /></label>
            <label className="text-sm font-medium sm:col-span-2">Notas<textarea name="notas" defaultValue={op?.notas ?? ""} maxLength={2000} rows={2} className={campo} /></label>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-base font-bold">Personal</legend>
            {personas.length === 0 && <p className="text-sm text-tinta-suave">Sin personal registrado. <Link href="/equipo" className="underline">Agregar</Link></p>}
            {personas.map((p) => {
              const reserva = propias.find((r) => r.persona_id === p.id);
              const ocupado = compromisos((r) => r.persona_id === p.id);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-tinta/10 p-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                    <input type="checkbox" name="persona" value={p.id} defaultChecked={Boolean(reserva)} className="size-5" />
                    {p.nombre}
                  </label>
                  <select name={`funcion_${p.id}`} defaultValue={reserva?.funcion ?? p.funciones[0]} aria-label={`Función de ${p.nombre}`} className="rounded-lg border bg-white px-2 py-1.5 text-sm">
                    {FUNCIONES.filter((f) => p.funciones.includes(f.valor)).map((f) => <option key={f.valor} value={f.valor}>{f.titulo}</option>)}
                  </select>
                  {ocupado.length > 0 && (
                    <p className={`w-full text-xs ${tramo ? "font-semibold text-red-700" : "text-tinta-suave"}`}>
                      {tramo ? "Ocupado en: " : "Comprometido en: "}{textoCompromisos(ocupado)}
                    </p>
                  )}
                </div>
              );
            })}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-base font-bold">Kits</legend>
            {kits.length === 0 && <p className="text-sm text-tinta-suave">Sin kits armados. <Link href="/equipo" className="underline">Armar uno</Link></p>}
            {kits.map((k) => {
              const equiposDelKit = k.kit_equipos.map((x) => x.equipos).filter((e): e is NonNullable<typeof e> => Boolean(e));
              const ocupado = compromisos((r) => r.kit_id === k.id && r.equipo_id === null);
              const compartidos = equiposDelKit
                .map((e) => ({ e, donde: compromisos((r) => r.equipo_id === e.id && r.kit_id !== k.id) }))
                .filter((x) => x.donde.length > 0);
              return (
                <div key={k.id} className="rounded-xl border border-tinta/10 p-2">
                  <label className="flex items-center gap-2 font-medium">
                    <input type="checkbox" name="kit" value={k.id} defaultChecked={propias.some((r) => r.kit_id === k.id)} className="size-5" />
                    {k.nombre}
                  </label>
                  <p className="ml-7 text-xs text-tinta-suave">{equiposDelKit.map((e) => `${e.nombre} (${e.codigo})`).join(" · ") || "Sin equipos"}</p>
                  {ocupado.length > 0 && (
                    <p className={`ml-7 text-xs ${tramo ? "font-semibold text-red-700" : "text-tinta-suave"}`}>
                      {tramo ? "Ocupado en: " : "Comprometido en: "}{textoCompromisos(ocupado)}
                    </p>
                  )}
                  {compartidos.map(({ e, donde }) => (
                    <p key={e.id} className={`ml-7 text-xs ${tramo ? "font-semibold text-red-700" : "text-tinta-suave"}`}>
                      {e.nombre} ({e.codigo}) está en otro kit: {textoCompromisos(donde)}
                    </p>
                  ))}
                </div>
              );
            })}
          </fieldset>
        </FormularioAgenda>
      </section>

      {op && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-lg font-bold">Costos</h2>
          <p className="mb-3 text-sm text-tinta-suave">El presupuesto es lo que se espera gastar y no se resta de la ganancia. El gasto real sí.</p>
          <FormularioAgenda accion={guardarCostosOperativo} etiqueta="Guardar costos">
            <input type="hidden" name="operativo_id" value={op.id} />
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-tinta-suave"><th className="py-1">Categoría</th><th>Presupuesto</th><th>Gasto real</th></tr></thead>
              <tbody>
                {CATEGORIAS_COSTO.map((c) => {
                  const fila = costos.find((x) => x.categoria === c.valor);
                  const antigua = columnaAntigua[c.valor] ? Number(op[columnaAntigua[c.valor]] ?? 0) : 0;
                  return (
                    <tr key={c.valor} className="border-t border-tinta/10">
                      <td className="py-1.5 pr-2 font-medium">{c.titulo}</td>
                      <td className="pr-2"><input name={`presupuesto_${c.valor}`} inputMode="numeric" defaultValue={fila?.presupuesto || ""} placeholder="0" className="w-full rounded-lg border px-2 py-1.5" /></td>
                      <td>
                        {antigua > 0 ? (
                          <span className="text-xs text-tinta-suave">{clp(antigua)} (en Costos y metas)</span>
                        ) : (
                          <input name={`real_${c.valor}`} inputMode="numeric" defaultValue={fila?.real ?? ""} placeholder="—" className="w-full rounded-lg border px-2 py-1.5" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </FormularioAgenda>
        </section>
      )}
    </div>
  );
}
