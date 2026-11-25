"use client";

import { useState } from "react";
import Link from "next/link";
import { coincidePaciente } from "@/lib/buscar-paciente";
import { useAtenciones } from "@/lib/offline/use-atenciones";
import { pacienteDesdeFormulario, type PacienteParaAtender } from "@/lib/datos-paciente";
import DatosPaciente from "./datos-paciente";
import type { cargarCatalogoParaCotizar } from "@/lib/catalogo-laboratorio";
import NuevoPaciente from "./nuevo-paciente";
import NuevaReceta from "./[id]/nueva-receta";

export default function AtencionEnPagina({ usuarioId, pacientes, operativos, operativoId, cotizar, puedeVender, hoy }: {
  usuarioId: string; pacientes: PacienteParaAtender[]; operativos: { id: string; nombre: string }[];
  operativoId?: string; cotizar: Awaited<ReturnType<typeof cargarCatalogoParaCotizar>>; puedeVender: boolean; hoy: string;
}) {
  const [paciente, setPaciente] = useState<PacienteParaAtender | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [locales, setLocales] = useState<PacienteParaAtender[]>([]);
  const guardadas = useAtenciones(usuarioId, paciente?.id);
  const pendientes = (guardadas ?? []).flatMap(a => a.tipo === "paciente" && !a.error
    ? [pacienteDesdeFormulario(a.id, { get: campo => a.campos[campo] ?? null })] : []);
  const lista = [...new Map([...locales, ...pendientes, ...pacientes].map(p => [p.id, p])).values()];
  const [sede, setSede] = useState(operativos.find(o => o.id === operativoId)?.id ?? "");
  const tieneFicha = paciente && (pacientes.some(p => p.id === paciente.id)
    || (guardadas && !guardadas.some(a => a.id === paciente.id)));
  const coincidencias = (busqueda ? lista.filter(p => coincidePaciente(p, busqueda)) : lista).slice(0, 6);

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm" aria-label="Atención en terreno">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Atención en terreno</h2>
        {puedeVender && <Link href={sede ? `/ventas?op=${sede}` : "/ventas"} target="_blank" className="text-sm font-semibold text-brand-dark underline">Abrir punto de venta</Link>}
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        Operativo
        <select className="rounded-lg border border-tinta-suave/30 px-3 py-2" value={sede} onChange={evento => setSede(evento.target.value)}>
          <option value="">Sin operativo</option>
          {operativos.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
      </label>
      {paciente ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-bold">{paciente.nombre}</h3>
              <DatosPaciente paciente={paciente} hoy={hoy} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              {tieneFicha && <Link href={`/pacientes/${paciente.id}${sede ? `?op=${sede}` : ""}`} className="text-brand-dark underline">Ver ficha completa</Link>}
              <button type="button" className="rounded-lg bg-crema px-3 py-2" onClick={() => setPaciente(null)}>Siguiente paciente</button>
            </div>
          </div>
          <NuevaReceta key={`${paciente.id}:${sede}`} usuarioId={usuarioId} pacienteId={paciente.id} operativos={operativos}
            operativoInicial={sede || undefined} costos={cotizar.filas} catalogoLab={cotizar.catalogo}
            recargosMarcos={cotizar.recargosMarcos} puedeVender={puedeVender} abierto />
        </>
      ) : (
        <>
          <label className="grid gap-1 text-sm font-semibold">
            Nombre o RUT en este equipo
            <input className="rounded-lg border border-tinta-suave/30 px-3 py-2" type="search" value={busqueda} onChange={evento => setBusqueda(evento.target.value)} />
          </label>
          {coincidencias.length > 0 && <ul className="flex flex-wrap gap-2">
            {coincidencias.map(p => <li key={p.id}>
              <button type="button" onClick={() => setPaciente(p)} className="rounded-lg bg-crema px-3 py-2 text-sm">
                {p.nombre}{p.rut ? ` · ${p.rut}` : ""}
              </button>
            </li>)}
          </ul>}
          <NuevoPaciente usuarioId={usuarioId} alGuardar={nuevo => {
            setLocales(lista => [nuevo, ...lista]);
            setPaciente(nuevo);
            setBusqueda("");
          }} />
        </>
      )}
    </section>
  );
}
