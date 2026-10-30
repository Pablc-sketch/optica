"use client";
import { useState, useTransition } from "react";
import { generarMensajeOperativo } from "@/lib/actions/mensaje-optica-ia";
import { mensajeBasico, type ContextoMensaje } from "@/lib/mensaje-optica-ia";

const OPCIONES = [
  { nombre: "Ya estamos en la sede", pedido: "Avisar que ya estamos en la sede para la entrega y recordar el horario guardado. Invitar a retirar a quienes ya tengan aviso de lentes listos." },
  { nombre: "Recordar horario", pedido: "Recordar brevemente la fecha, sede y horario de entrega guardados." },
  { nombre: "Atraso", pedido: "Redactar un aviso de atraso. Motivo: [completar]. Nueva hora estimada: [por confirmar]. Pedir disculpas sin inventar detalles." },
  { nombre: "Otro mensaje", pedido: "" },
];
export default function RedactorOpticaIA({ operativoId, contexto, onUsar, bloqueado = false }: {
  operativoId: string; contexto: ContextoMensaje; onUsar: (texto: string) => void; bloqueado?: boolean;
}) {
  const [pedido, setPedido] = useState("");
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [pendiente, iniciar] = useTransition();
  return <details className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
    <summary className="cursor-pointer font-semibold text-sky-900">✨ Redactar con IA</summary>
    <div className="mt-3 flex flex-wrap gap-2">{OPCIONES.map((o) => <button type="button" key={o.nombre} disabled={pendiente} onClick={() => setPedido(o.pedido)} className="rounded-lg border bg-white px-3 py-2 text-sm">{o.nombre}</button>)}</div>
    <label className="mt-3 block text-sm font-semibold">¿Qué necesitas avisar?
      <textarea value={pedido} onChange={(e) => setPedido(e.target.value)} maxLength={1500} rows={3} placeholder="Ej.: Ya llegamos. Hoy estaremos hasta las 16:00; avisar de forma cordial." className="mt-1 w-full rounded-lg border bg-white p-3 font-normal" />
    </label>
    <p className="text-xs text-tinta-suave">Usa la fecha, horario y lugar guardados. Describe la situación sin RUT ni datos clínicos.</p>
    {bloqueado && <p className="mt-2 text-sm text-amber-900">Guarda los cambios de entrega antes de generar o aplicar el mensaje.</p>}
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={bloqueado || pendiente || !pedido.trim()} className="rounded-xl bg-sky-800 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={() => iniciar(async () => {
        setError(""); setEstado("");
        try { const r = await generarMensajeOperativo({ operativoId, instrucciones: pedido });
          if (r.texto) { setTexto(r.texto); setEstado("Borrador generado con IA. Revísalo antes de usarlo."); }
          else setError(r.error || "No se pudo generar.");
        } catch { setError("No se pudo generar. Reintenta o usa la plantilla básica."); }
      })}>{pendiente ? "Redactando…" : "Generar con IA"}</button>
      <button type="button" disabled={bloqueado || pendiente} onClick={() => { setTexto(mensajeBasico(contexto)); setError(""); setEstado("Plantilla básica, sin IA."); }} className="rounded-xl border bg-white px-4 py-2 text-sm">Plantilla básica</button>
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {estado && <p role="status" className="mt-2 text-sm text-sky-900">{estado}</p>}
    {texto && <><label className="mt-3 block text-sm font-semibold">Borrador editable<textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={4000} rows={7} className="mt-1 w-full rounded-lg border bg-white p-3 font-normal" /></label>
      <div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={bloqueado || pendiente} onClick={() => { onUsar(texto); setEstado("Aplicado al aviso. No se ha enviado a nadie."); }} className="rounded-xl bg-green-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Usar en aviso de entrega</button>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(texto); setEstado("Copiado."); } catch { setError("No se pudo copiar. Selecciona el texto manualmente."); } }} className="rounded-xl border bg-white px-4 py-2">Copiar</button></div>
    </>}
  </details>;
}
