"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { registrarVenta } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
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
  const router = useRouter();
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
    if (!navigator.onLine) return;
    if (pendientes(usuarioId).length === 0 && legadoPendiente() === 0) return;
    const res = await sincronizar(usuarioId, registrarVenta, createClient());
    if (res.aplicadas > 0) router.refresh();
  }, [usuarioId, router]);

  useEffect(() => {
    const disparar = () => void intentarSync();
    disparar();
    window.addEventListener("online", disparar);
    window.addEventListener(OUTBOX_EVENT, disparar);
    const timer = window.setInterval(disparar, 20000);
    return () => {
      window.removeEventListener("online", disparar);
      window.removeEventListener(OUTBOX_EVENT, disparar);
      window.clearInterval(timer);
    };
  }, [intentarSync]);

  if (online && nPendientes === 0 && listaFallidas.length === 0) return null;

  return (
    <div className="relative flex items-center gap-2 text-xs font-semibold">
      {!online && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
          Sin conexión{nPendientes > 0 ? ` · ${nPendientes} guardada${nPendientes === 1 ? "" : "s"}` : ""}
        </span>
      )}
      {online && nPendientes > 0 && (
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">Sincronizando {nPendientes}…</span>
      )}
      {listaFallidas.length > 0 && (
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 hover:bg-red-200"
        >
          ⚠ {listaFallidas.length} venta{listaFallidas.length === 1 ? "" : "s"} sin aplicar · revisar
        </button>
      )}
      {abierto && listaFallidas.length > 0 && (
        <div className="absolute right-0 top-9 z-20 w-80 rounded-xl border border-red-200 bg-white p-3 text-left font-normal shadow-lg">
          <p className="mb-2 text-sm font-bold text-red-900">Ventas offline que el servidor no aceptó</p>
          <ul className="flex flex-col gap-2">
            {listaFallidas.map((f) => {
              const total = f.input.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);
              return (
                <li key={f.id} className="rounded-lg bg-red-50 p-2 text-xs">
                  <p className="font-semibold">
                    {new Date(f.creada).toLocaleString("es-CL", { timeZone: "America/Santiago" })} · {clp(total)}
                  </p>
                  <p className="text-tinta-suave">{f.input.items.map((i) => i.descripcion).join(", ")}</p>
                  <p className="mt-1 text-red-800">{f.error}</p>
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
