"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MensajeChat } from "@/lib/asistente/conversacion";
import { ETIQUETAS, type Propuesta } from "@/lib/cambios-operativo";
import { aplicarCambioOperativo } from "@/lib/actions/asistente";

// Botón flotante del asistente de IA, disponible en todas las pantallas del
// administrador. La conversación vive solo en esta pestaña: al cerrar
// sesión o recargar se borra, y nunca se guarda en Lentia.

const SUGERENCIAS = [
  "¿Qué les falta a mis próximos operativos?",
  "La dirección del operativo de Talagante es Av. Bernardo O'Higgins 1234, Talagante",
  "¿Cuánto debería presupuestar para un operativo de 2 días en Pichilemu, con 3 personas?",
  "¿Sería rentable una junta de vecinos de 1 día en Talagante?",
  "¿Cuáles fueron mis 5 operativos más rentables y qué comuna me conviene más?",
];

type Pendiente = { operativo_id: string; nombre: string; fecha: string; problemas: string[] };
type EstadoPropuesta = Propuesta & { estado?: "guardando" | "aplicado" | "descartado"; aviso?: string };

const valor = (v: unknown) => (v === null || v === undefined || v === "" ? "(vacío)" : typeof v === "number" && v > 999 ? `$${v.toLocaleString("es-CL")}` : String(v));

// Un cambio que la IA preparó: se guarda solo si el administrador presiona Aplicar.
function TarjetaCambio({ p, cambiar }: { p: EstadoPropuesta; cambiar: (x: Partial<EstadoPropuesta>) => void }) {
  return (
    <div className="mr-4 space-y-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950">
      <p className="font-semibold">Cambio en «{p.operativo}»</p>
      <ul className="text-xs">
        {Object.entries(p.cambios).filter(([k]) => k !== "region").map(([k, v]) => (
          <li key={k}>{ETIQUETAS[k] ?? k}: <s className="opacity-60">{valor(p.antes[k as keyof typeof p.antes])}</s> → <b>{valor(v)}</b></li>
        ))}
      </ul>
      {p.estado === "aplicado" ? (
        <p className="text-xs font-semibold text-emerald-800">✓ Guardado</p>
      ) : p.estado === "descartado" ? (
        <p className="text-xs text-tinta-suave">Descartado</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={p.estado === "guardando"}
            onClick={async () => {
              cambiar({ estado: "guardando", aviso: undefined });
              const r = await aplicarCambioOperativo({ operativoId: p.operativo_id, cambios: p.cambios }).catch(() => ({ error: "Sin conexión." }));
              cambiar(r.error ? { estado: undefined, aviso: r.error } : { estado: "aplicado" });
            }}
            className="rounded-lg bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {p.estado === "guardando" ? "Guardando…" : "Aplicar"}
          </button>
          <button type="button" onClick={() => cambiar({ estado: "descartado" })} className="rounded-lg border px-3 py-1.5 text-xs">Descartar</button>
          {p.aviso && <span role="alert" className="text-xs text-red-800">{p.aviso}</span>}
        </div>
      )}
    </div>
  );
}

export default function AsistenteIA() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const final = useRef<HTMLDivElement>(null);
  const [pendientes, setPendientes] = useState<Pendiente[] | null>(null);
  const [porConfirmar, setPorConfirmar] = useState(0);
  // Cambios preparados por la IA, por número de mensaje.
  const [propuestas, setPropuestas] = useState<Record<number, EstadoPropuesta[]>>({});

  // Lo que falta en los operativos (reglas fijas, sin gastar IA).
  useEffect(() => {
    fetch("/api/asistente/pendientes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pendientes?: Pendiente[]; por_confirmar?: number } | null) => {
        setPendientes(d?.pendientes ?? null);
        setPorConfirmar(d?.por_confirmar ?? 0);
      })
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
    // Si se recortó la conversación, los números de mensaje cambian.
    if (historial.length < mensajes.length + 1) setPropuestas({});
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
      const datos = (await r.json().catch(() => ({}))) as { texto?: string; error?: string; propuestas?: Propuesta[] };
      if (!r.ok || !datos.texto) {
        setError(datos.error ?? "No se pudo responder. Reintenta.");
        setMensajes(historial.slice(0, -1));
        setTexto(t);
      } else {
        setMensajes([...historial, { rol: "asistente", texto: datos.texto }]);
        if (datos.propuestas?.length) setPropuestas((x) => ({ ...x, [historial.length]: datos.propuestas! }));
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
        {((pendientes?.length ?? 0) + porConfirmar) > 0 && (
          <span className="rounded-full bg-amber-400 px-2 text-xs font-bold text-amber-950" aria-label={`${(pendientes?.length ?? 0) + porConfirmar} pendientes`}>
            {(pendientes?.length ?? 0) + porConfirmar}
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
          <p className="text-xs text-tinta-suave">Operativos, costos y pendientes. Los cambios se guardan solo si tú presionas Aplicar.</p>
        </div>
        <div className="flex gap-1">
          {mensajes.length > 0 && (
            <button type="button" onClick={() => { setMensajes([]); setPropuestas({}); setError(null); }} className="rounded-lg px-2 py-1 text-sm hover:bg-crema">
              Nueva
            </button>
          )}
          <button type="button" aria-label="Cerrar asistente" onClick={() => setAbierto(false)} className="rounded-lg px-2 py-1 text-lg leading-none hover:bg-crema">
            ×
          </button>
        </div>
      </header>

      <div className="min-h-40 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {mensajes.length === 0 && porConfirmar > 0 && (
          <Link href="/whatsapp?ver=por_confirmar" onClick={() => setAbierto(false)} className="block rounded-xl bg-emerald-50 px-3 py-2 font-semibold text-emerald-950 underline">
            {porConfirmar} persona{porConfirmar === 1 ? "" : "s"} de WhatsApp por confirmar →
          </Link>
        )}
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
          <div key={i} className="space-y-2">
            <div
              className={
                m.rol === "usuario"
                  ? "ml-8 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand px-3 py-2 text-white"
                  : "mr-4 whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-crema-claro px-3 py-2"
              }
            >
              {m.rol === "asistente" ? m.texto.replace(/\*\*(.+?)\*\*/g, "$1") : m.texto}
            </div>
            {(propuestas[i] ?? []).map((p, j) => (
              <TarjetaCambio
                key={j}
                p={p}
                cambiar={(x) => setPropuestas((todo) => ({ ...todo, [i]: todo[i].map((q, k) => (k === j ? { ...q, ...x } : q)) }))}
              />
            ))}
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
