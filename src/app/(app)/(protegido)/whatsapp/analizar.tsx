"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { analizarChats } from "@/lib/actions/whatsapp";

// Al abrir la bandeja, la IA revisa sola los chats con mensajes nuevos
// (de a 8). También se puede pedir de nuevo con el botón.
export default function AnalizarChats({ cantidad }: { cantidad: number }) {
  const [pendiente, iniciar] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const router = useRouter();
  const lanzado = useRef(false);

  function analizar() {
    iniciar(async () => {
      const r: { error?: string; mensaje?: string } = await analizarChats().catch(() => ({ error: "Sin conexión. Reintenta." }));
      setMensaje(r.error ?? r.mensaje ?? null);
      if (!r.error) router.refresh();
    });
  }

  useEffect(() => {
    if (lanzado.current) return;
    lanzado.current = true;
    analizar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-sky-50 p-3 text-sm text-sky-950">
      <span>{pendiente ? "La IA está leyendo los chats nuevos…" : `${cantidad} chat${cantidad === 1 ? "" : "s"} con mensajes nuevos.`}</span>
      {!pendiente && <button type="button" onClick={analizar} className="rounded-lg bg-sky-800 px-3 py-1.5 font-semibold text-white">Revisar con IA</button>}
      {mensaje && !pendiente && <span role="status">{mensaje}</span>}
    </div>
  );
}
