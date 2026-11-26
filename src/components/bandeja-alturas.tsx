"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AvisoAltura } from "@/lib/avisos-altura";

const RUTA = "/api/avisos-altura";
const WORKER = "/avisos-altura-sw.js";

async function guardar(datos: Record<string, unknown>) {
  const respuesta = await fetch(RUTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  const resultado = await respuesta.json().catch(() => null);
  if (!respuesta.ok || !resultado?.ok) throw new Error(resultado?.error ?? "No se pudo guardar. Intenta de nuevo.");
}

export default function BandejaAlturas({ tenantId, clavePush }: { tenantId: string; clavePush: string }) {
  const [avisos, setAvisos] = useState<AvisoAltura[]>([]);
  const [abierta, setAbierta] = useState(false);
  const [pushActivo, setPushActivo] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState("");
  const conocidos = useRef(new Set<string>());
  const confirmados = useRef(new Set<string>());

  useEffect(() => {
    let pendiente = true;
    let pedido = 0;
    let aplicado = 0;
    async function actualizar() {
      const numero = ++pedido;
      try {
        const res = await fetch(RUTA, { cache: "no-store" });
        if (!pendiente || numero <= aplicado) return;
        if (res.redirected || res.status === 401 || res.status === 403) {
          aplicado = numero;
          setAvisos([]);
          setAbierta(false);
          return;
        }
        if (!res.ok) return;
        const estado = await res.json() as { avisos: AvisoAltura[]; pushActivo: boolean };
        if (!pendiente || numero <= aplicado) return;
        aplicado = numero;
        const nuevos = estado.avisos.filter(a => !confirmados.current.has(a.id));
        if (nuevos.some(a => !conocidos.current.has(a.id))) setAbierta(true);
        conocidos.current = new Set(nuevos.map(a => a.id));
        setAvisos(nuevos);
        setPushActivo(estado.pushActivo);
      } catch {
        // La bandeja conserva el último dato y vuelve a consultar al reconectar.
      }
    }

    function mensajeDelWorker(evento: MessageEvent) {
      if (evento.data?.tipo !== "LENTIA_AVISOS_ALTURA") return;
      setAbierta(true);
      void actualizar();
    }
    const cliente = createClient();
    const canal = cliente.channel(`avisos-altura-${tenantId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "avisos_medicion_altura", filter: `tenant_id=eq.${tenantId}`,
      }, () => void actualizar())
      .subscribe(estado => { if (estado === "SUBSCRIBED") void actualizar(); });
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === "visible") void actualizar();
    }, 8000);
    window.addEventListener("focus", actualizar);
    window.addEventListener("online", actualizar);
    document.addEventListener("visibilitychange", actualizar);
    navigator.serviceWorker?.addEventListener("message", mensajeDelWorker);
    if (new URLSearchParams(window.location.search).get("avisos") === "altura") {
      queueMicrotask(() => { if (pendiente) setAbierta(true); });
    }
    void actualizar();
    return () => {
      pendiente = false;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", actualizar);
      window.removeEventListener("online", actualizar);
      document.removeEventListener("visibilitychange", actualizar);
      navigator.serviceWorker?.removeEventListener("message", mensajeDelWorker);
      void cliente.removeChannel(canal);
    };
  }, [tenantId]);

  async function confirmar(id: string) {
    setMensaje("");
    setGuardando(id);
    try {
      await guardar({ accion: "tomada", id });
      confirmados.current.add(id);
      setAvisos(actuales => actuales.filter(a => a.id !== id));
    } catch (error) {
      setMensaje((error as Error).message);
    } finally {
      setGuardando(null);
    }
  }

  async function cambiarAvisosDelTelefono() {
    if (configurando) return;
    setConfigurando(true);
    setMensaje("");
    try {
      if (pushActivo) {
        await guardar({ accion: "desactivar" });
        const registro = await navigator.serviceWorker?.getRegistration("/");
        const anterior = await registro?.pushManager.getSubscription();
        await anterior?.unsubscribe().catch(() => false);
        setPushActivo(false);
        return;
      }
      if (!("Notification" in window) || !navigator.serviceWorker || !("PushManager" in window)) {
        throw new Error("Este navegador no ofrece avisos del teléfono.");
      }
      if (await Notification.requestPermission() !== "granted") {
        throw new Error("Permite las notificaciones de Lentia en el navegador para recibir avisos.");
      }
      await navigator.serviceWorker.register(WORKER, { scope: "/" });
      const registro = await navigator.serviceWorker.ready;
      const anterior = await registro.pushManager.getSubscription();
      await anterior?.unsubscribe();
      const suscripcion = await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clavePush });
      try {
        await guardar({ accion: "activar", suscripcion: suscripcion.toJSON() });
      } catch (error) {
        await suscripcion.unsubscribe().catch(() => false);
        throw error;
      }
      setPushActivo(true);
    } catch (error) {
      setMensaje((error as Error).message || "No se pudieron activar los avisos del teléfono.");
    } finally {
      setConfigurando(false);
    }
  }

  return <>
    <button type="button" aria-expanded={abierta} aria-controls="bandeja-alturas" onClick={() => setAbierta(value => !value)}
      className={`whitespace-nowrap rounded-lg border px-2.5 py-2 text-xs font-semibold ${avisos.length ? "border-amber-200 bg-amber-200 text-amber-950" : "border-white/20 text-white hover:bg-white/10"}`}>
      Altura{avisos.length ? ` · ${avisos.length}` : ""}
    </button>
    {abierta && createPortal(
      <aside id="bandeja-alturas" aria-label="Avisos de altura" className="fixed inset-x-3 top-16 z-[60] max-h-[70dvh] overflow-y-auto rounded-2xl border border-amber-300 bg-white p-4 text-tinta shadow-xl sm:left-auto sm:right-4 sm:top-20 sm:w-[25rem] lg:top-4 print:hidden">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-amber-950">Tomar altura</h2>
            {avisos.length > 0 && <p className="text-sm text-tinta-suave" role="status">Toma la altura antes de que el paciente se vaya de la sede.</p>}
          </div>
          <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-brand-dark hover:bg-crema" onClick={() => setAbierta(false)}>Minimizar</button>
        </div>
        {avisos.length === 0 && <p className="rounded-lg bg-crema-claro p-3 text-sm">No hay alturas pendientes.</p>}
        <ul className="space-y-2">
          {avisos.map(aviso => <li key={aviso.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="font-bold text-amber-950">{aviso.paciente}</p>
            <p className="text-sm">{[aviso.tipo, aviso.sede, `OT #${aviso.folio} · Par ${aviso.par}`].filter(Boolean).join(" · ")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" disabled={guardando !== null} onClick={() => void confirmar(aviso.id)}
                className="rounded-lg bg-amber-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {guardando === aviso.id ? "Confirmando…" : "Altura tomada"}
              </button>
              <Link href={`/ot/${aviso.otId}`} onClick={() => setAbierta(false)} className="px-2 py-2 text-sm font-semibold text-brand-dark underline">Ver OT</Link>
            </div>
          </li>)}
        </ul>
        {clavePush && <button type="button" disabled={configurando} onClick={() => void cambiarAvisosDelTelefono()}
          className="mt-3 text-sm font-semibold text-brand-dark underline disabled:opacity-60">
          {configurando ? "Guardando…" : pushActivo ? "Desactivar avisos del teléfono" : "Activar avisos del teléfono"}
        </button>}
        {mensaje && <p className="mt-2 text-sm text-red-700" role="status">{mensaje}</p>}
      </aside>,
      document.body,
    )}
  </>;
}
