"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MensajeChat } from "@/lib/asistente/conversacion";

// Botón flotante del asistente de IA, disponible en todas las pantallas del
// administrador. La conversación vive solo en esta pestaña: al cerrar
// sesión o recargar se borra, y nunca se guarda en Lentia.

const SUGERENCIAS = [
  "¿Qué les falta a mis próximos operativos?",
  "¿Cuánto debería presupuestar para un operativo de 2 días en Pichilemu, con 3 personas?",
  "¿Sería rentable una junta de vecinos de 1 día en Talagante?",
  "¿Cuáles fueron mis 5 operativos más rentables y qué comuna me conviene más?",
];

type Pendiente = { operativo_id: string; nombre: string; fecha: string; problemas: string[] };

export default function AsistenteIA() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement>(null);
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);

  // Lo que falta en los operativos (reglas fijas, sin gastar IA).
  useEffect(() => {
    fetch("/api/asistente/pendientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pendientes?: Pendiente[] } | null) => setPendientes(d?.pendientes ?? null))
      .catch(() => setPendientes(null));
  }, [abierto]);

  useEffect(() => {
    final.current?.scrollIntoView({ block: "end" });
  }, [mensajes, cargando]);

  async function enviar(pregunta: string) {
    const t = pregunta.trim();
    if (!t || cargando) return;
    // Últimos 19 mensajes + la pregunta nueva; siempre parte por el usuario.
    const nuevo: MensajeChat = { rol: "usuario", texto: t };
    let historial: MensajeChat[] = [...mensajes, nuevo].slice(-19);
    while (historial[0]?.rol !== "usuario") historial = historial.slice(1);
    setMensajes(historial);
    setTexto("");
    setError(null);
    setCargando(true);
    try {
      const r = await fetch("/api/asistente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensajes: historial, ruta }),
      });
      const datos = (await r.json().catch(() => ({}))) as { texto?: string; error?: string };
      if (!r.ok || !datos.texto) {
        setError(datos.error ?? "No se pudo responder. Reintenta.");
        setMensajes(historial.slice(0, -1));
        setTexto(t);
      } else {
        setMensajes([...historial, { rol: "asistente", texto: datos.texto }]);
      }
    } catch {
      setError("Sin conexión. Reintenta.");
      setMensajes(historial.slice(0, -1));
      setTexto(t);
    } finally {
      setCargando(false);
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-brand px-4 py-3 font-semibold text-white shadow-lg hover:bg-brand-dark print:hidden"
      >
        <span aria-hidden>✦</span> Asistente
        {pendientes && pendientes.length > 0 && (
          <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-amber-950" aria-label={`${pendientes.length} operativos con pendientes`}>
            {pendientes.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <section
      aria-label="Asistente de IA"
      className="fixed inset-x-2 bottom-2 z-30 flex max-h-[85dvh] flex-col rounded-2xl border bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[26rem] print:hidden"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="font-bold">✦ Asistente</h2>
          <p className="text-xs text-tinta-suave">Operativos, costos y pendientes. Solo datos de tu óptica, sin pacientes.</p>
        </div>
        <div className="flex gap-1">
          {mensajes.length > 0 && (
            <button type="button" onClick={() => { setMensajes([]); setError(null); }} className="rounded-lg px-2 py-1 text-sm hover:bg-crema">
              Nueva
            </button>
          )}
          <button type="button" aria-label="Cerrar asistente" onClick={() => setAbierto(false)} className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-crema">
            ×
          </button>
        </div>
      </header>

      <div className="min-h-40 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {mensajes.length === 0 && pendientes && pendientes.length > 0 && (
          <details className="rounded-xl bg-amber-50 px-3 py-2 text-amber-950" open>
            <summary className="cursor-pointer font-semibold">Pendientes en {pendientes.length} operativo{pendientes.length === 1 ? "" : "s"}</summary>
            <ul className="mt-2 space-y-2">
              {pendientes.slice(0, 8).map((p) => (
                <li key={p.operativo_id}>
                  <Link href={`/operativos/${p.operativo_id}`} className="font-semibold underline" onClick={() => setAbierto(false)}>{p.nombre}</Link>
                  <span className="text-xs"> · {p.fecha.split("-").reverse().join("-")}</span>
                  <ul className="ml-4 list-disc text-xs">{p.problemas.map((x) => <li key={x}>{x}</li>)}</ul>
                </li>
              ))}
            </ul>
          </details>
        )}
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="text-tinta-suave">Pregunta, por ejemplo:</p>
            {SUGERENCIAS.map((s) => (
              <button key={s} type="button" onClick={() => enviar(s)} className="block w-full rounded-xl bg-crema-claro px-3 py-2 text-left hover:bg-crema">
                {s}
              </button>
            ))}
          </div>
        )}
        {mensajes.map((m, i) => (
          <div
            key={i}
            className={
              m.rol === "usuario"
                ? "ml-8 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-white"
                : "mr-4 whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-crema-claro px-3 py-2"
            }
          >
            {m.rol === "asistente" ? m.texto.replace(/\*\*(.+?)\*\*/g, "$1") : m.texto}
          </div>
        ))}
        {cargando && <p className="text-tinta-suave" role="status">Revisando tus operativos…</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{error}</p>}
        <div ref={final} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex gap-2 border-t p-3"
      >
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar(texto);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Escribe tu pregunta…"
          aria-label="Pregunta para el asistente"
          className="min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-base"
        />
        <button disabled={cargando || !texto.trim()} className="rounded-xl bg-brand px-4 font-semibold text-white disabled:opacity-50">
          Enviar
        </button>
      </form>
    </section>
  );
}
