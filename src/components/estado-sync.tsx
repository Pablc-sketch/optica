"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATENCIONES_EVENTO, enviarTerreno, leerAtenciones, reintentarAtencion, sincronizarAtenciones } from "@/lib/offline/atenciones";
import { useAtenciones } from "@/lib/offline/use-atenciones";
import { clp } from "@/lib/clp";
import { requiereVoucher } from "@/lib/voucher";
import CampoVoucher from "@/components/campo-voucher";
import {
  OUTBOX_EVENT,
  descartarFallida,
  fallidas,
  legadoPendiente,
  pendientes,
  reintentarFallida,
  sincronizar,
} from "@/lib/offline/outbox";

function suscribir(cb: () => void) {
  window.addEventListener(OUTBOX_EVENT, cb);
  window.addEventListener("storage", cb);
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener(OUTBOX_EVENT, cb);
    window.removeEventListener("storage", cb);
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

// Indicador de conexión/sincronización (spec 8.2). Silencioso cuando todo
// está al día. Si una venta offline no se pudo aplicar, se muestra con su
// motivo y se puede reintentar o descartar — nunca se pierde en silencio
// (A04).
export default function EstadoSync({ usuarioId }: { usuarioId: string }) {
  const atenciones = useAtenciones(usuarioId);
  const atencionesFallidas = atenciones?.filter(a => a.error) ?? [];
  const sincronizando = useRef(false);
  const corteHasta = useRef(0);
  const [abierto, setAbierto] = useState(false);

  // Lectura directa del almacenamiento local como "store" externo: sin
  // setState dentro de un efecto (lo que marcaba el lint, A15).
  const instantanea = useSyncExternalStore(
    suscribir,
    () =>
      JSON.stringify([
        navigator.onLine,
        pendientes(usuarioId).length + legadoPendiente(),
        fallidas(usuarioId).map((f) => f.id),
      ]),
    () => JSON.stringify([true, 0, []])
  );
  const [online, nPendientes] = JSON.parse(instantanea) as [boolean, number, string[]];
  const listaFallidas = typeof window === "undefined" ? [] : fallidas(usuarioId);

  const intentarSync = useCallback(async () => {
    if (!navigator.onLine || sincronizando.current || Date.now() < corteHasta.current) return;
    sincronizando.current = true;
    try {
      const clinicas = await leerAtenciones(usuarioId).catch(() => []);
      if (clinicas.some(a => !a.error)) {
        try {
          await sincronizarAtenciones(usuarioId);
        } catch {
          corteHasta.current = Date.now() + 3000;
        }
      }
      if (pendientes(usuarioId).length === 0 && legadoPendiente() === 0) return;
      const resultado = await sincronizar(usuarioId, async venta => {
        const respuesta = await enviarTerreno({ tipo: "venta", usuarioId, venta });
        return respuesta.ok ? { ok: true, ventaId: venta.ventaId, otFolio: null } : respuesta;
      }, legadoPendiente() ? createClient() : undefined, async venta => {
        if (!venta.pacienteId && !venta.recetaId) return true;
        const actuales = await leerAtenciones(usuarioId).catch(() => clinicas);
        return !actuales.some(a => a.id === venta.pacienteId || a.id === venta.recetaId);
      });
      if (resultado.sinConexion) corteHasta.current = Date.now() + 3000;
    } catch {
      corteHasta.current = Date.now() + 3000;
    } finally {
      sincronizando.current = false;
    }
  }, [usuarioId]);

  useEffect(() => {
    const disparar = () => void intentarSync();
    const reconectar = () => { corteHasta.current = 0; disparar(); };
    disparar();
    window.addEventListener("online", reconectar);
    window.addEventListener(OUTBOX_EVENT, disparar);
    window.addEventListener(ATENCIONES_EVENTO, disparar);
    document.addEventListener("visibilitychange", disparar);
    const timer = window.setInterval(disparar, 6000);
    return () => {
      window.removeEventListener("online", reconectar);
      window.removeEventListener(OUTBOX_EVENT, disparar);
      window.removeEventListener(ATENCIONES_EVENTO, disparar);
      document.removeEventListener("visibilitychange", disparar);
      window.clearInterval(timer);
    };
  }, [intentarSync]);

  const totalFallidas = listaFallidas.length + atencionesFallidas.length;
  const totalPendientes = nPendientes + (atenciones?.filter(a => !a.error).length ?? 0);
  if (online && totalPendientes === 0 && totalFallidas === 0) return null;

  return (
    <div className="relative flex items-center gap-2 text-xs font-semibold">
      {!online && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
          Sin conexión{totalPendientes > 0 ? ` · ${totalPendientes} por enviar` : ""}
        </span>
      )}
      {online && totalPendientes > 0 && (
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">{totalPendientes} por enviar</span>
      )}
      {totalFallidas > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 hover:bg-red-200"
        >
          Revisar {totalFallidas} {totalFallidas === 1 ? "registro" : "registros"}
        </button>
      )}
      {abierto && totalFallidas > 0 && (
        <div className="absolute right-0 top-9 z-20 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-red-200 bg-white p-3 text-left font-normal shadow-lg">
          <p className="mb-2 text-sm font-bold text-red-900">Registros que requieren revisión</p>
          <ul className="flex flex-col gap-2">
            {atencionesFallidas.map(a => (
              <li key={a.id} className="rounded-lg bg-red-50 p-2">
                <p className="font-semibold">{a.tipo === "paciente" ? "Alta de paciente" : "Receta"} · {new Date(a.creada).toLocaleTimeString("es-CL", { timeZone: "America/Santiago" })}</p>
                <p className="mt-1">{a.error}</p>
                <button type="button" onClick={() => void reintentarAtencion(a)} className="mt-2 rounded-md bg-brand px-2 py-1 font-semibold text-white">Reintentar</button>
              </li>
            ))}
            {listaFallidas.map((f) => {
              const total = f.input.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
              return (
                <li key={f.id} className="rounded-lg bg-red-50 p-2 text-xs">
                  <p className="font-semibold">
                    {new Date(f.creada).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · {clp(total)}
                  </p>
                  <p className="text-tinta-suave">{f.input.items.map((i) => i.descripcion).join(", ")}</p>
                  <p className="mt-1 text-red-800">{f.error}</p>
                  {requiereVoucher(f.input.medioPago, f.input.abonoInicial) && !f.input.numeroVoucher && (
                    <form action={(datos) => {
                      reintentarFallida(usuarioId, f.id, String(datos.get("numero_voucher") ?? "").trim());
                      void intentarSync();
                    }} className="mt-2 space-y-2">
                      <CampoVoucher />
                      <button className="rounded-md bg-brand px-2 py-1 font-semibold text-white">Completar y reintentar</button>
                    </form>
                  )}
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        reintentarFallida(usuarioId, f.id);
                        void intentarSync();
                      }}
                      className="rounded-md bg-brand px-2 py-1 font-semibold text-white"
                    >
                      Reintentar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("¿Descartar esta venta? No se va a registrar en el sistema.")) {
                          descartarFallida(usuarioId, f.id);
                        }
                      }}
                      className="rounded-md border border-red-300 px-2 py-1 font-semibold text-red-800"
                    >
                      Descartar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
