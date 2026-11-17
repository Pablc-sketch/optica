import Link from "next/link";
import { cubreDia, estadoDisponibilidad, eventosDelDia, urlAgenda, type BloqueLibre, type EventoAgenda, type FiltroAgenda } from "@/lib/agenda";
import { diaDeLaSemana, fechaConDia, rangoHorario, semanasDelMes, sumarDias } from "@/lib/fechas";
import { textoUbicacion } from "@/lib/mapas";

export const ESTILO_DISPONIBILIDAD = {
  disponible: { texto: "Disponible para agendar", corto: "Libre", clase: "border-green-800 bg-green-700 text-white" },
  ocupado: { texto: "Ocupado con otra óptica", corto: "Ocupado", clase: "border-red-800 bg-red-700 text-white" },
  propio: { texto: "Operativo de mi óptica", corto: "Mi óptica", clase: "border-blue-800 bg-blue-700 text-white" },
  sin_confirmar: { texto: "Sin confirmar", corto: "Consultar", clase: "border-slate-200 bg-slate-50 text-slate-600" },
};

export function LeyendaDisponibilidad({ nombreOptica }: { nombreOptica: string }) {
  return <div className="flex flex-wrap gap-2 text-sm font-bold" aria-label="Colores del calendario">
    <span className="rounded-lg bg-red-700 px-3 py-2 text-white">Ocupado · Otra óptica</span>
    <span className="rounded-lg bg-blue-700 px-3 py-2 text-white">{nombreOptica}</span>
    <span className="rounded-lg bg-green-700 px-3 py-2 text-white">Libre</span>
    <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">Sin confirmar</span>
  </div>;
}

export default function CalendarioDisponibilidad({ eventos, bloques, hoy, mes, seleccionado, nombreOptica = "Mi óptica", filtro = "todos" }: {
  eventos: EventoAgenda[]; bloques: BloqueLibre[]; hoy: string; mes?: string; seleccionado?: string; nombreOptica?: string; filtro?: FiltroAgenda;
}) {
  const dias = mes ? semanasDelMes(mes).flat() : Array.from({ length: 14 }, (_, i) => sumarDias(hoy, i));
  if (mes) return <div className="overflow-x-auto rounded-xl pb-2" role="region" aria-label="Calendario mensual de operativos; desplaza horizontalmente en pantallas pequeñas" tabIndex={0}>
    <div className="grid min-w-[840px] grid-cols-7 gap-2">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <span key={d} className="py-2 text-center text-sm font-bold text-tinta-suave">{d}</span>)}
      {dias.map((d, i) => {
        if (!d) return <span key={`vacio-${i}`} className="rounded-xl bg-slate-50/60" />;
        const visibles = eventosDelDia(eventos, d, filtro);
        const todos = eventosDelDia(eventos, d);
        const ocultos = todos.length - visibles.length;
        const estado = estadoDisponibilidad(d, bloques, eventos);
        return <Link key={d} href={`${urlAgenda(d, { filtro })}#detalle-dia`} aria-current={d === seleccionado ? "date" : undefined}
          aria-label={`${fechaConDia(d)}${d === hoy ? ", hoy" : ""}, ${visibles.length} operativos en esta vista${ocultos ? `, ${ocultos} en otro filtro` : ""}`}
          className={`flex min-h-36 min-w-0 flex-col gap-2 rounded-xl border p-2 transition hover:border-slate-400 hover:bg-slate-50 ${d === seleccionado ? "border-slate-900 bg-slate-50 ring-2 ring-slate-900" : "border-slate-200 bg-white"}`}>
          <div className="flex items-center justify-between gap-1">
            <span className={`grid h-8 w-8 place-items-center rounded-full text-lg font-bold ${d === hoy ? "bg-slate-900 text-white" : "text-tinta"}`}>{Number(d.slice(8))}</span>
            {d === hoy ? <span className="text-xs font-bold">Hoy</span> : d < hoy ? <span className="text-[10px] text-tinta-suave">Pasado</span> : null}
          </div>
          {visibles.map(e => <span key={e.id} className={`block rounded-lg border-l-4 p-2 text-left ${e.tipo === "propio" ? "border-blue-700 bg-blue-50 text-blue-950" : "border-red-700 bg-red-50 text-red-950"}`}>
            <span className="block text-xs font-bold tabular-nums">{e.tipo === "externo" ? "Sin horario" : rangoHorario(e.hora_inicio, e.hora_fin) ?? "Hora por definir"}</span>
            <span className="mt-1 block break-words text-sm font-bold leading-snug">{e.nombre}</span>
            {e.tipo === "externo" && e.optica && <span className="mt-1 block break-words text-xs">{e.optica}</span>}
            {textoUbicacion(e) && <span className="mt-1 block break-words text-xs leading-snug">{textoUbicacion(e)}</span>}
            {e.estado === "pendiente" && <span className="mt-1 block text-[10px] font-bold">Por confirmar</span>}
          </span>)}
          {visibles.length > 0 && <span className="mt-auto text-xs font-semibold text-tinta-suave">{visibles.length} {visibles.length === 1 ? "operativo" : "operativos"}</span>}
          {ocultos > 0 && <span className="rounded-md bg-slate-100 p-1.5 text-[11px] text-slate-700">+{ocultos} en {filtro === "propio" ? "otras ópticas" : nombreOptica}</span>}
          {todos.length === 0 && <span className={`mt-auto rounded-md px-2 py-1.5 text-xs ${estado === "disponible" ? "bg-green-100 font-bold text-green-900" : "text-tinta-suave"}`}>{estado === "disponible" ? "Libre" : "Sin agendar"}</span>}
        </Link>;
      })}
    </div>
  </div>;
  return <div className="grid grid-cols-7 gap-1 sm:gap-2">
    {mes && ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d =>
      <span key={d} className="py-2 text-center text-xs font-semibold text-tinta-suave">{d}</span>)}
    {dias.map((d, i) => {
      if (!d) return <span key={`vacio-${i}`} />;
      const estado = estadoDisponibilidad(d, bloques, eventos);
      const estilo = ESTILO_DISPONIBILIDAD[estado];
      const pasado = d < hoy;
      const enFecha = eventos.filter(e => e.estado !== "cancelado" && cubreDia(e, d));
      const detalle = enFecha.map(e => e.optica || e.nombre).join(", ");
      const tienePropio = estado === "ocupado" && enFecha.some(e => e.tipo === "propio");
      const etiqueta = estado === "propio" ? nombreOptica.replace(/^óptica\s+/i, "") : estilo.corto;
      return <Link key={d} href={`${urlAgenda(d)}#detalle-dia`} aria-current={d === seleccionado ? "date" : undefined}
        aria-label={`${fechaConDia(d)}${d === hoy ? ", hoy" : ""}, ${estilo.texto}${detalle ? `, ${detalle}` : ""}`}
        className={`flex min-h-20 min-w-0 flex-col items-center justify-center rounded-xl border py-2 text-center transition hover:brightness-95 sm:min-h-24 ${estilo.clase} ${pasado ? "opacity-60" : "shadow-sm"} ${d === seleccionado ? "outline-3 outline-offset-2 outline-tinta" : ""}`}>
        {!mes && <span className="text-[10px] capitalize sm:text-xs">{diaDeLaSemana(d).slice(0, 3)}</span>}
        <span className="text-lg font-bold leading-tight sm:text-2xl">{Number(d.slice(8))}{!mes && <span className="text-[10px] font-medium sm:text-xs">/{d.slice(5, 7)}</span>}</span>
        <span className="block w-full truncate px-0.5 text-[9px] font-bold sm:text-xs" title={estado === "propio" ? nombreOptica : estilo.texto}>{etiqueta}</span>
        {tienePropio && <span className="mt-0.5 block w-full truncate rounded bg-blue-700 px-0.5 text-[8px] font-bold text-white sm:text-[10px]" title={`También ${nombreOptica}`}>{nombreOptica.replace(/^óptica\s+/i, "")}</span>}
        {d === hoy && <span className="text-[9px] font-bold uppercase sm:text-[10px]">Hoy</span>}
      </Link>;
    })}
  </div>;
}
