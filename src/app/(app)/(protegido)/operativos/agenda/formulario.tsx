"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { buscarCruce, fechasAgendaValidas, horarioAgendaValido, urlAgenda, type EventoAgenda } from "@/lib/agenda";
import { guardarAgenda } from "@/lib/actions/agenda";

type Tipo = "propio" | "externo" | "disponible";
type Datos = {
  id: string; tipo: Tipo; fecha: string; fecha_fin: string; hora_inicio: string; hora_fin: string;
  nombre: string; optica: string; direccion: string; notas: string; estado: string;
};

const campo = "mt-1 w-full min-w-0 rounded-xl border bg-white px-2.5 py-2.5 text-base";

export default function FormularioAgenda({ inicial, edicion, eventos, nombreOptica, dia }: {
  inicial: Datos; edicion: boolean; eventos: EventoAgenda[]; nombreOptica: string; dia: string;
}) {
  const [valores, setValores] = useState(inicial);
  const [respuesta, enviar, pendiente] = useActionState(guardarAgenda.bind(null, edicion), {});
  const { tipo, fecha, fecha_fin, hora_inicio, hora_fin, estado } = valores;
  const conHorario = tipo === "propio";
  const fechaFin = fecha_fin || (conHorario ? fecha : "");
  const valido = fechasAgendaValidas(fecha, fechaFin) && (!conHorario || horarioAgendaValido(hora_inicio, hora_fin));
  const mismoRango = edicion && inicial.estado !== "cancelado" && fecha === inicial.fecha
    && fechaFin === (inicial.fecha_fin || inicial.fecha)
    && (!conHorario || (hora_inicio === inicial.hora_inicio && hora_fin === inicial.hora_fin));
  const cruce = tipo !== "disponible" && estado !== "cancelado" && valido && !mismoRango
    ? buscarCruce({
      fecha, fecha_fin: fechaFin,
      hora_inicio: conHorario ? hora_inicio : null,
      hora_fin: conHorario ? hora_fin : null,
    }, eventos, edicion ? inicial.id : undefined)
    : undefined;
  const cambiar = (key: keyof Datos, value: string) => setValores(v => ({ ...v, [key]: value }));
  const vincular = (key: keyof Datos) => ({
    name: key, value: valores[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      cambiar(key, e.target.value);
    },
  });

  return <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{tipo === "disponible" ? (edicion ? "Editar disponibilidad" : "Agregar disponibilidad") : edicion ? "Editar operativo" : "Nuevo operativo"}</h2>
      <Link href={urlAgenda(dia)} className="text-sm font-semibold text-brand-dark">Volver</Link>
    </div>
    <form action={enviar} className="grid gap-3">
      <input type="hidden" name="id" value={inicial.id} />
      <input type="hidden" name="tipo" value={tipo} />
      {!edicion && tipo !== "disponible" && <div aria-label="Tipo de operativo" className="grid grid-cols-2 gap-1 rounded-xl border border-tinta/10 p-1">
        {([["propio", nombreOptica], ["externo", "Otra óptica"]] as const).map(([value, label]) =>
          <button key={value} type="button" aria-pressed={tipo === value} onClick={() => cambiar("tipo", value)}
            className={`rounded-lg p-2 text-sm font-semibold ${tipo === value ? "bg-sky-100 text-sky-950" : "text-tinta-suave"}`}>{label}</button>
        )}
      </div>}
      {tipo !== "disponible" && <>
        <label className="text-sm font-medium">Nombre del operativo<input {...vincular("nombre")} required maxLength={160} className={campo} /></label>
        {tipo === "externo" && <label className="text-sm font-medium">Óptica externa<input {...vincular("optica")} required maxLength={160} className={campo} /></label>}
        <label className="text-sm font-medium">Lugar o comuna<input {...vincular("direccion")} maxLength={250} className={campo} /></label>
      </>}
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-sm font-medium">Fecha de inicio<input {...vincular("fecha")} type="date" required className={campo} /></label>
        <label className="min-w-0 text-sm font-medium">Fecha de término<input {...vincular("fecha_fin")} type="date" min={fecha} required={!conHorario} className={campo} /></label>
      </div>
      {conHorario && <>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0 text-sm font-medium">Hora de inicio<input {...vincular("hora_inicio")} type="time" required className={campo} /></label>
        <label className="min-w-0 text-sm font-medium">Hora de término<input {...vincular("hora_fin")} type="time" required className={campo} /></label>
      </div>
      <p className="text-xs text-tinta-suave">Hora de Chile continental · se repite cada día del operativo.</p>
      </>}
      {tipo !== "disponible" && <>
        <label className="text-sm font-medium">Estado<select {...vincular("estado")} className={campo}>
          <option value="pendiente">Por confirmar</option><option value="confirmado">Confirmado</option>
          {edicion && <option value="cancelado">Cancelado</option>}
        </select></label>
        <label className="text-sm font-medium">Notas de coordinación<textarea {...vincular("notas")} maxLength={2000} rows={2} className={campo} /></label>
      </>}
      {cruce && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950">Cruce con {cruce.nombre}. Revisa las fechas{conHorario && " y horas"}.</p>}
      {respuesta.error && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm font-semibold text-amber-950">{respuesta.error}</p>}
      <button disabled={pendiente || !!cruce} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:bg-neutral-200 disabled:text-neutral-700">
        {pendiente ? "Guardando…" : tipo === "disponible" ? "Guardar disponibilidad" : "Guardar operativo"}
      </button>
    </form>
  </section>;
}
