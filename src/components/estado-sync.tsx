"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  OUTBOX_EVENT,
  conflictos,
  descartarConflictos,
  pendientes,
  sincronizar,
} from "@/lib/offline/outbox";

// Indicador de conexión/sincronización (spec 8.2). Silencioso cuando todo
// está al día; visible cuando hay cola offline o conflictos.
export default function EstadoSync() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [nPendientes, setNPendientes] = useState(0);
  const [nConflictos, setNConflictos] = useState(0);

  const refrescarContadores = useCallback(() => {
    setNPendientes(pendientes().length);
    setNConflictos(conflictos().length);
  }, []);

  const intentarSync = useCallback(async () => {
    if (!navigator.onLine || pendientes().length === 0) return;
    const res = await sincronizar(createClient());
    refrescarContadores();
    if (res.aplicados > 0) router.refresh();
  }, [refrescarContadores, router]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refrescarContadores();

    const onOnline = () => {
      setOnline(true);
      void intentarSync();
    };
    const onOffline = () => setOnline(false);
    const onOutbox = () => {
      refrescarContadores();
      void intentarSync();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OUTBOX_EVENT, onOutbox);
    const timer = window.setInterval(() => void intentarSync(), 20000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OUTBOX_EVENT, onOutbox);
      window.clearInterval(timer);
    };
  }, [intentarSync, refrescarContadores]);

  if (online && nPendientes === 0 && nConflictos === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs font-semibold">
      {!online && (
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
          Sin conexión{nPendientes > 0 ? ` · ${nPendientes} guardado${nPendientes === 1 ? "" : "s"}` : ""}
        </span>
      )}
      {online && nPendientes > 0 && (
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-800">
          Sincronizando {nPendientes}…
        </span>
      )}
      {nConflictos > 0 && (
        <button
          type="button"
          title="Cambios que no se aplicaron porque otro dispositivo modificó el mismo dato. Revisa y vuelve a cargar si corresponde."
          onClick={() => {
            descartarConflictos();
            refrescarContadores();
          }}
          className="rounded-full bg-red-100 px-2.5 py-1 text-red-800 hover:bg-red-200"
        >
          ⚠ {nConflictos} conflicto{nConflictos === 1 ? "" : "s"} · descartar
        </button>
      )}
    </div>
  );
}
