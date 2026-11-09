import CalendarioDisponibilidad, { ESTADOS_DIA } from "@/components/calendario-disponibilidad";
import CabeceraPagina from "@/components/cabecera-pagina";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { redirect } from "next/navigation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarAgenda } from "@/lib/agenda-servidor";
import { cubreDia, estadoDiaAgenda, fechaAgendaValida, mostrarFechas, rangosDisponibles, RUTA_AGENDA, urlAgenda, type EventoAgenda } from "@/lib/agenda";
import { fechaConDia, horaCorta, hoyEnChile, mesDesplazado, nombreMes, primerDiaDelMes, rangoHorario, ultimoDiaDelMes } from "@/lib/fechas";
import { borrarDisponibilidad } from "@/lib/actions/agenda";
import FormularioAgenda from "./formulario";

const MARCAS = {
  propio: "bg-orange-100 text-orange-950",
  externo: "bg-sky-100 text-sky-950",
  disponible: "bg-green-100 text-green-950",
  pendiente: "bg-amber-100 text-amber-950",
};
const ESTADOS = { confirmado: "Confirmado", pendiente: "Por confirmar", realizado: "Realizado", cancelado: "Cancelado" };

function Evento({ evento, dia }: { evento: EventoAgenda; dia: string }) {
  const o = evento;
  return <article className="space-y-1 border-t border-tinta/10 py-3 first:border-0">
    <div className="flex flex-wrap gap-2 text-xs font-semibold">
      <span className={`rounded-full px-2 py-1 ${MARCAS[o.tipo]}`}>{o.tipo === "propio" ? o.optica : "Otra óptica"}</span>
      <span className={`rounded-full px-2 py-1 ${o.estado === "pendiente" ? MARCAS.pendiente : "bg-crema text-tinta-suave"}`}>{ESTADOS[o.estado]}</span>
    </div>
    <h3 className="pt-1 font-bold">{o.nombre}</h3>
    <p className="text-sm text-tinta-suave">
      {mostrarFechas(o)}
      {o.tipo === "propio" && ` · ${rangoHorario(o.hora_inicio, o.hora_fin) ?? "Horario por definir"}`}
    </p>
    {(o.tipo === "externo" || o.direccion) && <p className="text-sm">{[o.tipo === "externo" && o.optica, o.direccion].filter(Boolean).join(" · ")}</p>}
    {o.notas && <p className="whitespace-pre-line break-words text-sm text-tinta-suave">{o.notas}</p>}
    <div className="flex flex-wrap gap-4 pt-1 text-sm font-semibold text-brand-dark">
      {o.estado !== "realizado" && <Link href={urlAgenda(dia, { editar: o.id })}>Editar operativo</Link>}
      {o.tipo === "propio" && <Link href={`/operativos/${o.id}`}>Ver ficha del operativo →</Link>}
    </div>
  </article>;
}

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  if (esPilotoTerreno(tenantId)) redirect("/agenda/equipos");
  const params = await searchParams;
  const param = (k: string) => typeof params[k] === "string" ? params[k] as string : "";
  const hoy = hoyEnChile();
  const mesParam = param("mes");
  const mes = fechaAgendaValida(mesParam + "-01") ? mesParam : hoy.slice(0, 7);
  const diaParam = param("dia");
  const dia = fechaAgendaValida(diaParam) && diaParam.startsWith(mes) ? diaParam : hoy.startsWith(mes) ? hoy : primerDiaDelMes(mes);
  const { eventos, disponibilidad, nombreOptica, error } = await cargarAgenda(supabase, tenantId, primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const libres = rangosDisponibles(disponibilidad, eventos, hoy > primerDiaDelMes(mes) ? hoy : primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const delDia = eventos.filter(o => cubreDia(o, dia));
  const libreHoy = dia >= hoy && libres.some(b => cubreDia(b, dia));
  const estadoDia = ESTADOS_DIA[estadoDiaAgenda(disponibilidad, eventos, dia)];
  const declarados = disponibilidad.filter(b => cubreDia(b, dia));
  const editar = eventos.find(o => o.id === param("editar") && o.estado !== "realizado");
  const editarBloque = disponibilidad.find(b => b.id === param("editar"));
  const modo = param("nuevo");
  const mostrarFormulario = !error && (editar || editarBloque || modo === "operativo" || modo === "disponible");
  const tipo = editar?.tipo ?? (editarBloque || modo === "disponible" ? "disponible" : "propio");
  const registro = editar ?? editarBloque;

  return <div className={`mx-auto flex flex-col gap-4 ${mostrarFormulario ? "max-w-3xl" : ""}`}>
    <div>
      <CabeceraPagina seccion={nombreOptica} titulo="Disponibilidad del tecnólogo" />
      <p className="mt-2 text-sm text-tinta-suave">Elige un día verde para organizar un operativo.</p>
    </div>
    {error ? <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm">No se pudo cargar la agenda. Vuelve a intentar.</p> : mostrarFormulario ? (
      <FormularioAgenda key={registro?.id ?? `${dia}-${modo}`} dia={dia}
        edicion={!!registro} nombreOptica={nombreOptica} eventos={eventos} inicial={{
          id: registro?.id ?? randomUUID(), tipo, fecha: registro?.fecha ?? dia,
          fecha_fin: registro?.fecha_fin ?? (tipo === "propio" ? "" : registro?.fecha ?? ""),
          hora_inicio: horaCorta(editar?.hora_inicio) ?? "", hora_fin: horaCorta(editar?.hora_fin) ?? "", nombre: editar?.nombre ?? "",
          optica: editar?.tipo === "externo" ? editar.optica ?? "" : "", direccion: editar?.direccion ?? "",
          notas: editar?.notas ?? "", estado: editar?.estado ?? "pendiente",
        }} />
    ) : <>
      {param("guardado") === "1" && <p role="status" className="rounded-xl bg-green-100 p-3 text-sm text-green-950">Agenda actualizada.</p>}
      {param("error") === "cruce" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">El operativo se cruza con otro horario. Elige un bloque libre en la agenda.</p>}
      {param("error") === "borrar" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm">No se pudo quitar el bloque.</p>}
      <section id="disponibilidad" className="scroll-mt-32 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Días disponibles para agendar</h2>
          <Link href={urlAgenda(dia, { nuevo: "disponible" })} className="rounded-xl bg-green-800 px-4 py-3 text-sm font-bold text-white">＋ Agregar disponibilidad</Link>
        </div>
        {libres.length > 0 ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {libres.map(b => <li key={b.fecha}><Link href={urlAgenda(b.fecha)}
            className="flex h-full items-center justify-between gap-2 rounded-xl border border-green-200 bg-white p-4 font-bold">
            <span><span className="block text-xs font-semibold text-green-800">Disponible todo el día</span>{mostrarFechas(b)}</span><span aria-hidden="true">→</span>
          </Link></li>)}
        </ul> : <p className="mt-3 text-sm">No hay días disponibles confirmados en lo que queda de este mes.</p>}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section aria-label="Mes de la agenda" className="rounded-2xl bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold first-letter:uppercase">{nombreMes(mes)}</h2>
          <div className="flex gap-1.5">
            <Link href={urlAgenda(hoy)} className="grid min-h-10 place-items-center rounded-lg bg-crema px-3 text-sm font-semibold">Hoy</Link>
            <Link aria-label="Mes anterior" href={`${RUTA_AGENDA}?mes=${mesDesplazado(mes, -1)}`} className="grid min-h-10 min-w-10 place-items-center rounded-lg bg-crema">‹</Link>
            <Link aria-label="Mes siguiente" href={`${RUTA_AGENDA}?mes=${mesDesplazado(mes, 1)}`} className="grid min-h-10 min-w-10 place-items-center rounded-lg bg-crema">›</Link>
          </div>
        </div>
        <CalendarioDisponibilidad mes={mes} hoy={hoy} dia={dia} eventos={eventos} disponibilidad={disponibilidad} />
      </section>
      <section id="detalle-dia" className="scroll-mt-24 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">{fechaConDia(dia)}</h2>
        <p className={`mt-3 rounded-xl border p-3 font-bold ${dia < hoy ? "border-neutral-200 bg-neutral-100 text-neutral-600" : estadoDia.clase}`}>
          {dia < hoy ? "Fecha pasada" : estadoDia.titulo}
          {dia >= hoy && <span className="mt-1 block text-sm font-normal">{libreHoy ? "Puedes agendar un operativo este día." : estadoDia.titulo === "Sin confirmar" ? "Confirma la disponibilidad antes de agendar." : "Ya hay un compromiso en esta fecha."}</span>}
        </p>
        {delDia.length === 0 && <p className="mt-2 text-sm text-tinta-suave">Sin operativos agendados para este día.</p>}
        {delDia.map(o => <Evento key={o.id} evento={o} dia={dia} />)}
        {libreHoy && <Link href={urlAgenda(dia, { nuevo: "operativo" })}
          className="mt-2 flex justify-between gap-2 rounded-lg bg-green-100 p-2.5 text-sm font-semibold text-green-950">
          <span>Día disponible</span><span>Agendar →</span>
        </Link>}
        {declarados.length > 0 && <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-tinta-suave">Administrar disponibilidad</summary>
          {declarados.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{mostrarFechas(b)}</span>
            <div className="flex items-center gap-2">
              <Link href={urlAgenda(dia, { editar: b.id })} className="px-2 font-semibold text-brand-dark">Editar</Link>
              <form action={borrarDisponibilidad}>
                <input type="hidden" name="id" value={b.id} /><input type="hidden" name="fecha" value={b.fecha} />
                <button className="rounded-lg bg-crema px-3 py-2 font-semibold text-brand-dark">Quitar</button>
              </form>
            </div>
          </div>)}
        </details>}
      </section>
      </div>
      <Link href={urlAgenda(dia, { nuevo: "operativo" })} className="rounded-xl bg-brand px-4 py-3 text-center font-semibold text-white">＋ Nuevo operativo</Link>
      <Link href={`/operativos/calendario?mes=${mes}`} className="self-start text-sm font-semibold text-brand-dark">Metas y resultados del mes →</Link>
    </>}
  </div>;
}
