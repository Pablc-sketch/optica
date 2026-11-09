import Link from "next/link";
import { cubreDia, estadoDiaAgenda, urlAgenda, type BloqueLibre, type EventoAgenda } from "@/lib/agenda";
import { fechaConDia, semanasDelMes } from "@/lib/fechas";

export const ESTADOS_DIA = {
  disponible: { titulo: "Disponible", corto: "Libre", clase: "border-green-300 bg-green-100 text-green-950" },
  ocupado: { titulo: "Ocupado", corto: "Ocup.", clase: "border-red-200 bg-red-100 text-red-950" },
  reservado: { titulo: "Reservado", corto: "Reserva", clase: "border-amber-300 bg-amber-100 text-amber-950" },
  sin_confirmar: { titulo: "Sin confirmar", corto: "—", clase: "border-neutral-200 bg-neutral-50 text-neutral-600" },
};

export default function CalendarioDisponibilidad({ mes, hoy, dia, eventos, disponibilidad }: {
  mes: string; hoy: string; dia?: string; eventos: EventoAgenda[]; disponibilidad: BloqueLibre[];
}) {
  return <div>
    <div className="grid grid-cols-7 gap-1 text-center sm:gap-1.5">
      {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d =>
        <span key={d} className="py-2 text-xs font-bold text-tinta-suave">{d}</span>)}
      {semanasDelMes(mes).flat().map((d, i) => {
        if (!d) return <span key={`vacio-${i}`} />;
        const estado = ESTADOS_DIA[estadoDiaAgenda(disponibilidad, eventos, d)];
        const nombres = eventos.filter(e => e.estado !== "cancelado" && cubreDia(e, d)).map(e => e.nombre).join(", ");
        const pasado = d < hoy;
        const etiqueta = `${fechaConDia(d)}${d === hoy ? ", hoy" : ""}: ${pasado ? "Fecha pasada" : estado.titulo}${nombres ? `. ${nombres}` : ""}`;
        return <Link key={d} href={`${urlAgenda(d)}#detalle-dia`} aria-current={d === dia ? "date" : undefined}
          aria-label={etiqueta} title={etiqueta}
          className={`relative flex min-h-16 min-w-0 flex-col items-center justify-center rounded-lg border text-center transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-800 sm:min-h-20 ${pasado ? "border-neutral-200 bg-neutral-100 text-neutral-500" : estado.clase} ${d === dia ? "ring-2 ring-inset ring-sky-800" : ""}`}>
          <span className="text-lg font-bold tabular-nums sm:text-xl">{Number(d.slice(8))}</span>
          <span className="text-[10px] font-semibold leading-4 sm:hidden">{pasado ? "Pasó" : estado.corto}</span>
          <span className="hidden text-xs font-semibold sm:block">{pasado ? "Fecha pasada" : estado.titulo}</span>
          {d === hoy && <span className="absolute right-1 top-0.5 text-[9px] font-bold uppercase text-sky-900">Hoy</span>}
        </Link>;
      })}
    </div>
    <div aria-label="Colores de disponibilidad" className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
      {Object.entries(ESTADOS_DIA).map(([key, estado]) =>
        <span key={key} className={`rounded-lg border px-2 py-1.5 ${estado.clase}`}>{estado.titulo}</span>)}
    </div>
    <p className="mt-2 text-xs text-tinta-suave">Solo los días verdes están disponibles. Toca una fecha para ver el detalle.</p>
  </div>;
}
