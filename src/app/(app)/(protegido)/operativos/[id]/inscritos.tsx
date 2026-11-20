"use client";

import { useState, useTransition } from "react";
import { extraerInscritos, guardarInscritos, marcarLlegada } from "@/lib/actions/inscritos-operativo";
import { linkWhatsapp } from "@/lib/whatsapp";

type Fila = { nombre: string; telefono: string };
type Inscrito = Fila & { id: string; llego: boolean };

export default function Inscritos({ operativoId, nombre, fecha, direccion, lista }: {
  operativoId: string; nombre: string; fecha: string; direccion: string; lista: Inscrito[];
}) {
  const [texto, setTexto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([]);
  const [estado, setEstado] = useState("");
  const [pendiente, iniciar] = useTransition();

  return <section className="rounded-2xl border border-sky-200 bg-white p-4 print:hidden">
    <h2 className="font-semibold">Inscritos al operativo</h2>
    <p className="mb-3 text-sm">{lista.length} inscritos · {lista.filter((fila) => !fila.llego).length} por llegar</p>
    <ul className="space-y-2">
      {lista.map((fila) => <li key={fila.id} className="flex flex-wrap items-center gap-3 border-b py-2 text-sm">
        <span className="font-medium">{fila.nombre}</span>
        <a className="underline" href={`tel:+${fila.telefono}`}>Llamar</a>
        <a className="underline" target="_blank" rel="noreferrer" href={linkWhatsapp("auto", fila.telefono,
          `Hola ${fila.nombre}, te escribimos de la óptica para recordarte el operativo ${nombre}.${fecha ? ` Fecha: ${fecha}.` : ""}${direccion ? ` Lugar: ${direccion}.` : ""}`)}>Recordar por WhatsApp</a>
        <button className="underline" disabled={pendiente} onClick={() => iniciar(async () => {
          const r = await marcarLlegada(operativoId, fila.id, !fila.llego);
          setEstado(r.error ?? "");
        })}>{fila.llego ? "Llegó · deshacer" : "Marcar llegada"}</button>
      </li>)}
    </ul>
    <details className="mt-4">
      <summary className="cursor-pointer font-medium">Agregar inscritos</summary>
      <label className="mt-3 block text-sm">
        Pega los mensajes de inscripción con nombres y teléfonos. Omite recetas y datos clínicos.
        <textarea className="mt-1 block w-full rounded border p-2" value={texto} maxLength={6000} rows={3} onChange={(e) => setTexto(e.target.value)} />
      </label>
      <div className="my-2 flex flex-wrap gap-4 text-sm">
        <button className="underline" disabled={pendiente || !texto.trim() || filas.length >= 40} onClick={() => iniciar(async () => {
          setEstado("");
          const r = await extraerInscritos(texto);
          if (r.inscritos?.length) setFilas([...filas, ...r.inscritos].slice(0, 40));
          else setEstado(r.error ?? "No se identificaron inscripciones en el texto.");
        })}>Analizar con OpenAI</button>
        <button className="underline" disabled={pendiente || filas.length >= 40} onClick={() => setFilas([...filas, { nombre: "", telefono: "" }])}>Agregar a mano</button>
      </div>
      {filas.map((fila, i) => <div key={i} className="mb-2 flex flex-wrap gap-2">
        {(["nombre", "telefono"] as const).map((campo) => <input key={campo} className="rounded border p-1" value={fila[campo]}
          aria-label={campo === "nombre" ? "Nombre" : "Celular"} placeholder={campo === "nombre" ? "Nombre" : "+56 9 ..."}
          disabled={pendiente} onChange={(e) => setFilas(filas.map((f, j) => j === i ? { ...f, [campo]: e.target.value } : f))} />)}
        <button className="text-sm underline" disabled={pendiente} onClick={() => setFilas(filas.filter((_, j) => i !== j))}>Quitar</button>
      </div>)}
      {filas.length > 0 && <button className="rounded bg-sky-900 px-4 py-2 text-white" disabled={pendiente} onClick={() => iniciar(async () => {
        const r = await guardarInscritos(operativoId, filas);
        setEstado(r.error ?? "Lista guardada.");
        if (r.ok) { setFilas([]); setTexto(""); }
      })}>Guardar inscritos</button>}
    </details>
    <p role="status" className="mt-2 text-sm">{pendiente ? "Procesando…" : estado}</p>
  </section>;
}
