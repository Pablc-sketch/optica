import CalendarioDisponibilidad, { ESTILO_DISPONIBILIDAD } from "@/components/calendario-disponibilidad";
import CabeceraPagina from "@/components/cabecera-pagina";
import { esPilotoTerreno } from "@/lib/piloto-terreno";
import { redirect } from "next/navigation";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarAgenda } from "@/lib/agenda-servidor";
import { cubreDia, diaBreve, estadoDisponibilidad, eventosDelDia, fechaAgendaValida, filtroAgenda, mostrarFechas, rangosDisponibles, resumenAgenda, urlAgenda, type EventoAgenda, type FiltroAgenda } from "@/lib/agenda";
import { fechaConDia, horaCorta, hoyEnChile, mesDesplazado, nombreMes, primerDiaDelMes, rangoHorario, ultimoDiaDelMes } from "@/lib/fechas";
import { cambiarEstadoOperativo } from "@/lib/actions/operativos";
import BotonEnviar from "@/components/boton-enviar";
import { borrarDisponibilidad } from "@/lib/actions/agenda";
import FormularioAgenda from "./formulario";
import { comoLlegar, mapaUbicacion, rutaDelDia, textoUbicacion } from "@/lib/mapas";

const ESTADOS = { confirmado: "Confirmado", pendiente: "Por confirmar", realizado: "Realizado", cancelado: "Cancelado" };

function Evento({ evento: o, dia, filtro, administrador, archivo }: { evento: EventoAgenda; dia: string; filtro: FiltroAgenda; administrador: boolean; archivo: boolean }) {
  return <article className={`grid gap-2 rounded-lg border-l-4 bg-slate-50 p-3 sm:grid-cols-[8rem_minmax(0,1fr)_auto] ${o.tipo === "propio" ? "border-blue-700" : "border-red-700"}`}>
    <p className="text-base font-bold tabular-nums">{o.tipo === "externo" ? "Sin horario" : rangoHorario(o.hora_inicio, o.hora_fin) ?? "Hora por definir"}</p>
    <div className="min-w-0">
      <h3 className="break-words text-lg font-bold">{o.nombre}</h3>
      <p className="mt-1 break-words text-sm text-tinta-suave">{textoUbicacion(o) || "Lugar / comuna por definir"}</p>
      {mapaUbicacion(o) && <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold text-brand-dark"><a href={mapaUbicacion(o)!} target="_blank" rel="noopener noreferrer">Ver mapa ↗</a><a href={comoLlegar(o)!} target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a></div>}
      <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
        <span className={`rounded-full px-2 py-1 ${o.tipo === "propio" ? "bg-blue-100 text-blue-950" : "bg-red-100 text-red-950"}`}>{o.optica || "Otra óptica"}</span>
        <span className={`rounded-full px-2 py-1 ${o.estado === "pendiente" ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-600"}`}>{archivo && (o.estado === "pendiente" || o.estado === "confirmado") ? "Fecha pasada" : ESTADOS[o.estado]}</span>
      </div>
      {o.notas && <details className="mt-2 text-sm text-tinta-suave"><summary>Notas de coordinación</summary><p className="mt-2 whitespace-pre-line break-words">{o.notas}</p></details>}
    </div>
    <div className="flex flex-wrap items-start gap-2 text-sm font-semibold sm:flex-col">
      {o.estado !== "realizado" && <Link href={urlAgenda(dia, { editar: o.id, filtro, ...(archivo ? { ver: "archivo" } : {}) })} className="rounded-lg bg-crema px-3 py-2.5 text-brand-dark">Editar</Link>}
      {administrador && !archivo && o.tipo === "propio" && <form action={cambiarEstadoOperativo}>
        <input type="hidden" name="id" value={o.id} /><input type="hidden" name="estado" value="realizado" /><input type="hidden" name="estado_anterior" value="planificado" />
        <BotonEnviar className="rounded-lg border bg-white px-3 py-2.5">Marcar realizado</BotonEnviar>
      </form>}
      {administrador && o.tipo === "propio" && <Link href={`/operativos/${o.id}`} className="rounded-lg px-3 py-2.5 text-brand-dark">Ver ficha →</Link>}
    </div>
  </article>;
}

export default async function Agenda({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase, tenantId, rol } = await exigirRolPagina(["admin", "ventas"]);
  const administrador = rol === "admin";
  if (administrador && esPilotoTerreno(tenantId)) redirect("/agenda/equipos");
  const params = await searchParams;
  const param = (k: string) => typeof params[k] === "string" ? params[k] as string : "";
  const hoy = hoyEnChile();
  const mesParam = param("mes");
  const mes = fechaAgendaValida(mesParam + "-01") ? mesParam : hoy.slice(0, 7);
  const diaParam = param("dia");
  const dia = fechaAgendaValida(diaParam) && diaParam.startsWith(mes) ? diaParam : hoy.startsWith(mes) ? hoy : primerDiaDelMes(mes);
  const filtro = filtroAgenda(param("filtro"));
  const archivo = param("ver") === "archivo";
  const modoVista: Record<string, string> = archivo ? { ver: "archivo" } : {};
  const enlace = (fecha: string, extra: Record<string, string> = {}) =>
    urlAgenda(fecha, { filtro, ...modoVista, ...extra });
  const { eventos, disponibilidad, nombreOptica, error } = await cargarAgenda(supabase, tenantId, primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const libres = rangosDisponibles(disponibilidad, eventos, hoy > primerDiaDelMes(mes) ? hoy : primerDiaDelMes(mes), ultimoDiaDelMes(mes));
  const resumen = resumenAgenda(eventos, primerDiaDelMes(mes), ultimoDiaDelMes(mes), filtro, { archivo, hoy });
  const delDia = eventosDelDia(eventos, dia, filtro, { archivo, hoy });
  const totalDia = eventosDelDia(eventos, dia, "todos", { archivo, hoy }).length;
  const estadoDia = estadoDisponibilidad(dia, disponibilidad, eventos);
  const declarados = disponibilidad.filter(b => cubreDia(b, dia));
  const editar = eventos.find(o => o.id === param("editar") && o.estado !== "realizado");
  const editarBloque = disponibilidad.find(b => b.id === param("editar"));
  const modo = param("nuevo");
  const mostrarFormulario = !error && (editar || editarBloque || modo === "operativo" || modo === "disponible");
  const tipo = editar?.tipo ?? (editarBloque || modo === "disponible" ? "disponible" : param("tipo") === "externo" || filtro === "externo" ? "externo" : "propio");
  const registro = editar ?? editarBloque;
  const tituloVista = filtro === "propio" ? nombreOptica : filtro === "externo" ? "Otras ópticas" : "Todos los operativos";
  const ruta = archivo ? null : rutaDelDia(delDia);
  const cantidad = new Set(resumen.flatMap(d => d.eventos.map(e => e.id))).size;

  return <div className={`mx-auto flex min-w-0 flex-col gap-5 ${mostrarFormulario ? "max-w-3xl" : ""}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><CabeceraPagina seccion="En terreno" titulo="Calendario" /><p className="text-sm text-tinta-suave">Sedes y horarios de tus operativos</p></div>
      {!mostrarFormulario && <div className="flex flex-wrap gap-2">
        <Link href={urlAgenda(dia, { filtro, ...(archivo ? {} : { ver: "archivo" }) })} className="rounded-xl border bg-white px-4 py-3 text-sm font-semibold">{archivo ? "Volver a activos" : "Archivo"}</Link>
        {!archivo && <Link href={enlace(dia, { nuevo: "operativo" })} className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">＋ Nuevo operativo</Link>}
      </div>}
    </div>
    {error ? <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm">No se pudo cargar la agenda. Vuelve a intentar.</p> : mostrarFormulario ? (
      <FormularioAgenda key={registro?.id ?? `${dia}-${modo}-${tipo}`} dia={dia} filtro={filtro} administrador={administrador}
        edicion={!!registro} nombreOptica={nombreOptica} eventos={eventos} inicial={{
          id: registro?.id ?? randomUUID(), tipo, fecha: registro?.fecha ?? dia,
          fecha_fin: registro?.fecha_fin ?? (tipo === "propio" ? "" : registro?.fecha ?? ""),
          hora_inicio: horaCorta(editar?.hora_inicio) ?? "", hora_fin: horaCorta(editar?.hora_fin) ?? "", nombre: editar?.nombre ?? "",
          optica: editar?.tipo === "externo" ? editar.optica ?? "" : "", direccion: editar?.direccion ?? "", comuna: editar?.comuna ?? "", region: editar?.region ?? "",
          notas: editar?.notas ?? "", estado: editar?.estado ?? "pendiente",
        }} />
    ) : <>
      {param("eliminado") === "1" && <p role="status" className="rounded-xl bg-green-100 p-3 text-sm text-green-950">Operativo eliminado del calendario.</p>}
      {param("guardado") === "1" && <p role="status" className="rounded-xl bg-green-100 p-3 text-sm text-green-950">Agenda actualizada.</p>}
      {param("error") === "cruce" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-950">El operativo se cruza con otro horario. Elige un bloque libre en la agenda.</p>}
      {param("error") === "borrar" && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm">No se pudo quitar el bloque.</p>}
      <nav aria-label="Filtrar operativos" className="grid grid-cols-3 gap-2 rounded-2xl bg-white p-2 shadow-sm">
        {([["propio", nombreOptica], ["externo", "Otras ópticas"], ["todos", "Todos"]] as const).map(([valor, nombre]) =>
          <Link key={valor} href={urlAgenda(dia, { ...modoVista, filtro: valor })} aria-current={filtro === valor ? "page" : undefined}
            className={`grid min-h-14 place-items-center rounded-xl px-2 py-3 text-center text-sm font-bold sm:text-base ${filtro === valor ? valor === "propio" ? "bg-blue-700 text-white" : valor === "externo" ? "bg-red-700 text-white" : "bg-slate-900 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{nombre}</Link>)}
      </nav>
      <section aria-label="Mes de la agenda" className="min-w-0 rounded-2xl bg-white p-3 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold first-letter:uppercase">{archivo && "Archivo · "}{nombreMes(mes)}</h2>
          <div className="flex gap-2">
            <Link href={enlace(hoy)} className="grid min-h-11 place-items-center rounded-lg bg-crema px-4 font-semibold">Hoy</Link>
            <Link aria-label="Mes anterior" href={enlace(primerDiaDelMes(mesDesplazado(mes, -1)))} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-crema text-xl">‹</Link>
            <Link aria-label="Mes siguiente" href={enlace(primerDiaDelMes(mesDesplazado(mes, 1)))} className="grid min-h-11 min-w-11 place-items-center rounded-lg bg-crema text-xl">›</Link>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-tinta-suave" aria-label="Colores del calendario">
          <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-blue-700" />{nombreOptica}</span>
          <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-red-700" />Otras ópticas</span>
          <span><span aria-hidden className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-green-700" />Libre confirmado</span>
        </div>
        <p className="mb-2 text-xs text-tinta-suave lg:hidden">Desliza el calendario hacia los lados.</p>
        <CalendarioDisponibilidad eventos={eventos} bloques={disponibilidad} hoy={hoy} mes={mes} seleccionado={dia} nombreOptica={nombreOptica} filtro={filtro} archivo={archivo} />
      </section>
      <section id="detalle-dia" className="scroll-mt-40 rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{fechaConDia(dia)}</h2>
          <div className="flex flex-wrap gap-2">
            {ruta && <a href={ruta} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-brand-dark">Ruta del día ↗</a>}
            {!archivo && <Link href={enlace(dia, { nuevo: "operativo" })} className="rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white">＋ Agendar este día</Link>}
          </div>
        </div>
        {!archivo && totalDia === 0 && estadoDia === "disponible" && <p className={`mt-3 inline-block rounded-lg px-3 py-2 text-sm font-semibold ${ESTILO_DISPONIBILIDAD.disponible.clase}`}>Disponible para agendar</p>}
        {delDia.length === 0 && <p className="mt-2 text-sm text-tinta-suave">{archivo ? "Sin operativos archivados para este día." : "Sin operativos activos en este filtro."}</p>}
        {totalDia > delDia.length && <Link href={urlAgenda(dia, { ...modoVista, filtro: "todos" })} className="mt-2 inline-block py-2 text-sm font-semibold text-brand-dark">Ver todas las ópticas</Link>}
        {delDia.length > 0 && <div className="mt-3 space-y-2">{delDia.map(o => <Evento key={o.id} evento={o} dia={dia} filtro={filtro} administrador={administrador} archivo={archivo} />)}</div>}
        {!archivo && declarados.length > 0 && <details className="mt-3 text-sm"><summary className="text-tinta-suave">Administrar disponibilidad</summary>
          {declarados.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span>{mostrarFechas(b)}</span><div className="flex gap-2">
            <Link href={enlace(dia, { editar: b.id })} className="px-2 py-2 font-semibold text-brand-dark">Editar</Link>
            <form action={borrarDisponibilidad}><input type="hidden" name="id" value={b.id} /><input type="hidden" name="fecha" value={b.fecha} /><button className="rounded-lg bg-crema px-3 py-2 font-semibold text-brand-dark">Quitar</button></form>
          </div></div>)}
        </details>}
      </section>
      <section aria-label="Resumen de operativos del mes" className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-bold">Resumen · {tituloVista}</h2>
          <p className="text-sm text-tinta-suave">{cantidad} {cantidad === 1 ? "operativo" : "operativos"} · {resumen.length} {resumen.length === 1 ? "día" : "días"}{!archivo && " con atención"}</p>
        </div>
        {resumen.length > 0 && <details className="mt-2">
          <summary className="w-fit cursor-pointer py-2 text-sm font-semibold text-brand-dark">Ver fechas y sedes</summary>
          <ul className="divide-y divide-tinta/10 text-sm">
            {resumen.map(grupo => <li key={grupo.fecha} id={`resumen-${grupo.fecha}`}>
              <Link href={`${enlace(grupo.fecha)}#detalle-dia`} className="block rounded-lg px-2 py-2 hover:bg-crema">
                <time dateTime={grupo.fecha} className="mr-2 font-semibold capitalize">{diaBreve(grupo.fecha)}</time>
                <span>{grupo.eventos.map(o => [horaCorta(o.hora_inicio), o.nombre, o.comuna].filter(Boolean).join(" ")).join(" · ")}</span>
              </Link>
            </li>)}
          </ul>
        </details>}
      </section>
      {!archivo && <details id="disponibilidad" className="scroll-mt-32 rounded-2xl border border-green-200 bg-green-50 p-4 sm:p-5">
        <summary className="font-bold text-green-950">Disponibilidad para nuevos operativos</summary>
        <Link href={enlace(dia, { nuevo: "disponible" })} className="mt-3 inline-block rounded-xl bg-green-800 px-4 py-3 text-sm font-bold text-white">＋ Marcar disponibilidad</Link>
        {libres.length > 0 ? <ul className="mt-3 grid gap-2 sm:grid-cols-2">{libres.map(b => <li key={b.fecha}><Link href={enlace(b.fecha)} className="block rounded-xl bg-white p-3 font-bold text-green-950">{mostrarFechas(b)} →</Link></li>)}</ul> : <p className="mt-3 text-sm text-green-950">No hay días disponibles confirmados en lo que queda de este mes.</p>}
      </details>}
      {administrador && <Link href={`/operativos/calendario?mes=${mes}`} className="self-start text-sm font-semibold text-brand-dark">Metas y resultados del mes →</Link>}
    </>}
  </div>;
}
