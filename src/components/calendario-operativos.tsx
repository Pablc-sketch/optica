"use client";

import Link from "next/link";
import { useState } from "react";
import { agendaPorDia, cubreDia, estadoDisponibilidad, mostrarFechas, RUTA_AGENDA, urlAgenda, type BloqueLibre, type EventoAgenda, type VistaAgenda } from "@/lib/agenda";
import { diaDeLaSemana, fechaConDia, horaCorta, mesDesplazado, nombreMes, rangoHorario, semanasDelMes } from "@/lib/fechas";

const estados = { confirmado: "Confirmado", pendiente: "Por confirmar", realizado: "Realizado", cancelado: "Cancelado" };
const pluralOperativos = (n: number) => `${n} operativo${n === 1 ? "" : "s"}`;

function colorEvento(evento: EventoAgenda) {
  if (evento.estado === "realizado") return "border-slate-200 bg-slate-100 text-slate-700";
  return evento.tipo === "propio" ? "border-blue-200 bg-blue-100 text-blue-950" : "border-red-200 bg-red-100 text-red-950";
}

function horaEvento(evento: EventoAgenda) {
  return evento.tipo === "externo" ? "Sin horario" : rangoHorario(evento.hora_inicio, evento.hora_fin) ?? "Hora por definir";
}

export default function CalendarioOperativos({ eventos, bloques, hoy, mes, diaInicial, nombreOptica, vistaInicial }: {
  eventos: EventoAgenda[]; bloques: BloqueLibre[]; hoy: string; mes: string; diaInicial: string;
  nombreOptica: string; vistaInicial: VistaAgenda;
}) {
  const [vista, setVista] = useState(vistaInicial);
  const [seleccionado, setSeleccionado] = useState(diaInicial);
  const porDia = agendaPorDia(eventos, mes, vista);
  const visibles = eventos.filter(e => e.estado !== "cancelado" && (vista === "todos" || e.tipo === vista));
  const cancelados = eventos.filter(e => e.estado === "cancelado" && (vista === "todos" || e.tipo === vista));
  const filtros = [
    { valor: "todos", titulo: "Todos", color: "bg-slate-800 text-white", punto: "bg-slate-500" },
    { valor: "propio", titulo: nombreOptica, color: "bg-blue-700 text-white", punto: "bg-blue-700" },
    { valor: "externo", titulo: "Otras ópticas", color: "bg-red-700 text-white", punto: "bg-red-700" },
  ] as const;
  const nuevo = (dia: string) => urlAgenda(dia, { nuevo: "operativo", tipo: vista === "externo" ? "externo" : "propio", vista });
  const mesUrl = (valor: string) => `${RUTA_AGENDA}?${new URLSearchParams({ mes: valor, vista })}`;

  function filtrar(valor: VistaAgenda) {
    setVista(valor);
    const url = new URL(window.location.href);
    url.searchParams.set("vista", valor);
    window.history.replaceState(null, "", url);
  }

  function elegirDia(dia: string) {
    setSeleccionado(dia);
    const url = new URL(window.location.href);
    url.searchParams.set("dia", dia);
    window.history.replaceState(null, "", url);
    requestAnimationFrame(() => {
      document.getElementById(porDia.has(dia) ? `agenda-${dia}` : "detalle-dia")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function fila(evento: EventoAgenda, dia: string) {
    return <article key={evento.id} className="grid gap-2 border-t border-slate-100 px-4 py-4 first:border-0 sm:grid-cols-[9.5rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5">
      <p className={`self-start rounded-lg border px-3 py-2 text-sm font-bold ${colorEvento(evento)}`}>{horaEvento(evento)}</p>
      <div className="min-w-0">
        <h4 className="break-words text-base font-bold">{evento.nombre}</h4>
        <p className="mt-1 break-words text-sm text-tinta-suave">{evento.direccion || "Lugar o comuna por definir"}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={evento.tipo === "propio" ? "font-semibold text-blue-800" : "font-semibold text-red-800"}>{evento.optica || (evento.tipo === "propio" ? nombreOptica : "Otra óptica")}</span>
          <span className={evento.estado === "pendiente" ? "font-semibold text-amber-800" : "text-tinta-suave"}>{estados[evento.estado]}</span>
        </div>
        {evento.notas && <details className="mt-2 text-sm text-tinta-suave"><summary className="cursor-pointer">Notas</summary><p className="mt-2 whitespace-pre-line break-words">{evento.notas}</p></details>}
      </div>
      <div className="flex flex-wrap items-start gap-2 text-sm font-semibold">
        {evento.tipo === "propio" && <Link href={`/operativos/${evento.id}`} className="rounded-lg bg-crema px-3 py-2.5 text-brand-dark">Ver ficha</Link>}
        {evento.estado !== "realizado" && <Link href={urlAgenda(dia, { editar: evento.id, vista })} className="rounded-lg border border-slate-200 px-3 py-2.5 text-brand-dark">Editar</Link>}
      </div>
    </article>;
  }

  return <div className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div aria-label="Mostrar operativos" className="grid w-full grid-cols-3 gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 sm:w-auto sm:min-w-[30rem]">
        {filtros.map(f => <button key={f.valor} type="button" aria-pressed={vista === f.valor} onClick={() => filtrar(f.valor)}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:px-5 ${vista === f.valor ? f.color : "text-slate-700 hover:bg-slate-100"}`}>
          <span aria-hidden className={`hidden size-2 shrink-0 rounded-full sm:block ${vista === f.valor ? "bg-white" : f.punto}`} />{f.titulo}
        </button>)}
      </div>
      <Link href={nuevo(seleccionado)} className="w-full rounded-xl bg-brand px-5 py-3 text-center text-sm font-bold text-white sm:w-auto">＋ Nuevo operativo</Link>
    </div>

    <section aria-label="Mes de la agenda" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div>
          <h2 className="text-xl font-bold capitalize sm:text-2xl">{nombreMes(mes)}</h2>
          <p aria-live="polite" className="mt-1 text-sm text-tinta-suave">{pluralOperativos(visibles.length)} · {porDia.size} día{porDia.size === 1 ? "" : "s"} con operativos</p>
        </div>
        <nav aria-label="Cambiar mes" className="flex gap-2">
          <Link href={urlAgenda(hoy, { vista })} className="grid min-h-11 place-items-center rounded-xl bg-crema px-4 text-sm font-bold">Hoy</Link>
          <Link aria-label="Mes anterior" href={mesUrl(mesDesplazado(mes, -1))} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 text-xl">‹</Link>
          <Link aria-label="Mes siguiente" href={mesUrl(mesDesplazado(mes, 1))} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-slate-200 text-xl">›</Link>
        </nav>
      </div>
      <p className="px-4 pt-3 text-xs text-tinta-suave lg:hidden">Desliza el calendario hacia los lados para ver todos los días.</p>
      <div tabIndex={0} role="region" aria-label="Calendario mensual, desplazable horizontalmente" className="overflow-x-auto overscroll-x-contain p-3 sm:p-4">
        <div className="grid min-w-[924px] grid-cols-7 gap-2">
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d} className="pb-1 text-center text-sm font-bold text-slate-600">{d}</span>)}
          {semanasDelMes(mes).flat().map((dia, i) => {
            if (!dia) return <div key={`vacio-${i}`} aria-hidden className="rounded-xl bg-slate-50" />;
            const delDia = porDia.get(dia) ?? [];
            // La disponibilidad siempre considera TODOS los compromisos,
            // incluso si el filtro oculta los de otra óptica.
            const estado = estadoDisponibilidad(dia, bloques, eventos);
            const etiquetaVacio = estado === "disponible" ? "Libre" : estado === "ocupado" ? "Ocupado · Otra óptica" : estado === "propio" ? `Con ${nombreOptica}` : "Sin operativos";
            const borde = dia === seleccionado ? "border-slate-800 ring-2 ring-slate-300" : dia === hoy ? "border-blue-600 ring-2 ring-blue-100" : estado === "disponible" ? "border-green-200 bg-green-50/50" : "border-slate-200";
            return <button type="button" key={dia} onClick={() => elegirDia(dia)} aria-current={dia === hoy ? "date" : undefined} aria-pressed={dia === seleccionado}
              aria-label={`${fechaConDia(dia)}, ${pluralOperativos(delDia.length)}${delDia.length ? `, ${delDia.map(e => `${horaEvento(e)} ${e.nombre}`).join(", ")}` : `, ${etiquetaVacio}`}`}
              className={`flex min-h-44 min-w-0 flex-col gap-2 rounded-xl border p-2 text-left transition hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 ${borde}`}>
              <span className="flex w-full items-center justify-between gap-1"><span className={`text-lg font-bold ${dia < hoy ? "text-slate-500" : "text-slate-900"}`}>{Number(dia.slice(8))}</span>{dia === hoy && <span className="rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-bold text-white">Hoy</span>}</span>
              {delDia.length > 0 ? <>
                <span className="text-[11px] font-semibold text-slate-500">{pluralOperativos(delDia.length)}</span>
                {delDia.map(e => <span key={e.id} className={`block w-full rounded-lg border px-2 py-2 ${colorEvento(e)}`}>
                  <span className="block text-[11px] font-bold">{e.tipo === "externo" ? "Sin horario" : horaCorta(e.hora_inicio) ? `${horaCorta(e.hora_inicio)}${horaCorta(e.hora_fin) ? `–${horaCorta(e.hora_fin)}` : ""}` : "Hora por definir"}</span>
                  <span className="mt-0.5 block break-words text-xs font-semibold leading-snug">{e.nombre}</span>
                  {e.tipo === "externo" && e.optica && e.optica !== e.nombre && <span className="mt-0.5 block break-words text-[11px]">{e.optica}</span>}
                </span>)}
              </> : <span className={`mt-auto pb-1 text-xs font-semibold ${estado === "disponible" ? "text-green-800" : estado === "ocupado" ? "text-red-800" : "text-slate-500"}`}>{etiquetaVacio}</span>}
            </button>;
          })}
        </div>
      </div>
      <p className="px-4 pb-4 text-xs text-tinta-suave">Toca un día para ver sus sedes y horarios abajo. Azul: {nombreOptica} · Rojo: otras ópticas · Verde: libre confirmado.</p>
    </section>

    <section id="detalle-dia" aria-label="Resumen diario de operativos" className="scroll-mt-40 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Agenda del mes</h2>
        <p className="text-sm font-semibold text-tinta-suave">{filtros.find(f => f.valor === vista)?.titulo} · Por fecha y hora</p>
      </div>
      {!porDia.has(seleccionado) && <section tabIndex={-1} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="font-bold capitalize">{fechaConDia(seleccionado)}</h3>
        <p className="mt-2 text-sm text-tinta-suave">{eventos.some(e => e.estado !== "cancelado" && cubreDia(e, seleccionado)) ? "No hay operativos de este filtro. Hay compromisos en la vista Todos." : estadoDisponibilidad(seleccionado, bloques, eventos) === "disponible" ? "Día libre confirmado para agendar." : "Sin operativos agendados. Disponibilidad sin confirmar."}</p>
        <Link href={nuevo(seleccionado)} className="mt-3 inline-flex rounded-lg bg-crema px-4 py-3 text-sm font-bold text-brand-dark">＋ Agendar este día</Link>
      </section>}
      {porDia.size === 0 && <p role="status" className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">No hay operativos de este filtro en {nombreMes(mes)}.</p>}
      {Array.from(porDia, ([dia, delDia]) => <section key={dia} id={`agenda-${dia}`} tabIndex={-1}
        className={`scroll-mt-40 overflow-hidden rounded-2xl border bg-white shadow-sm ${dia === seleccionado ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white text-xl font-bold text-slate-900 shadow-sm">{Number(dia.slice(8))}</span>
            <div><h3 className="font-bold capitalize">{diaDeLaSemana(dia)} {Number(dia.slice(8))}/{dia.slice(5, 7)}{dia === hoy && " · Hoy"}</h3><p className="text-sm font-semibold text-slate-600">{pluralOperativos(delDia.length)}</p></div>
          </div>
          <Link href={nuevo(dia)} className="rounded-lg bg-white px-3 py-2.5 text-sm font-bold text-brand-dark">＋ Agregar sede</Link>
        </header>
        <div>{delDia.map(e => fila(e, dia))}</div>
      </section>)}
      {cancelados.length > 0 && <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-600">Cancelados ({cancelados.length})</summary>
        <div className="mt-3">{cancelados.map(e => <div key={e.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 py-3 text-sm"><span>{e.nombre} · {mostrarFechas(e)}</span><Link href={urlAgenda(e.fecha.startsWith(mes) ? e.fecha : `${mes}-01`, { editar: e.id, vista })} className="font-semibold text-brand-dark">Editar</Link></div>)}</div>
      </details>}
    </section>
  </div>;
}
