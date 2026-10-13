"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarConsulta } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { PRECIO_CONSULTA } from "@/lib/consulta";

const MEDIOS = [
  { valor: "debito", titulo: "Débito" },
  { valor: "credito", titulo: "Crédito" },
  { valor: "efectivo", titulo: "Efectivo" },
  { valor: "transferencia", titulo: "Transferencia" },
] as const;

// Cobrar una o varias consultas ($5.000 c/u) en el operativo elegido, en
// dos toques. Entra a la caja del operativo y cuadra con Mercado Pago.
export default function RegistrarConsulta({ operativoId }: { operativoId: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [medio, setMedio] = useState<string>("debito");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const id = useRef<string | null>(null);

  function registrar() {
    iniciar(async () => {
      id.current ??= crypto.randomUUID();
      const r = await registrarConsulta({ consultaId: id.current, operativoId, monto: PRECIO_CONSULTA, medioPago: medio, cantidad });
      if (r.ok) {
        id.current = null;
        setAbierto(false);
        setCantidad(1);
        setMensaje(`✓ ${cantidad === 1 ? "Consulta registrada" : `${cantidad} consultas registradas`} (${clp(PRECIO_CONSULTA * cantidad)})`);
        router.refresh();
      } else {
        setMensaje(r.error ?? "No se pudo registrar");
      }
    });
  }

  if (!abierto) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => {
            setAbierto(true);
            setMensaje(null);
          }}
          className="rounded-xl border-2 border-dashed border-brand/40 bg-white px-4 py-3 text-base font-semibold text-brand-dark hover:bg-brand/5"
        >
          ＋ Cobrar consulta {clp(PRECIO_CONSULTA)}
        </button>
        {mensaje && (
          <p className={`text-sm font-semibold ${mensaje.startsWith("✓") ? "text-emerald-800" : "text-red-700"}`}>{mensaje}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-semibold">Cobrar consulta</p>
      <div className="flex items-center gap-3">
        <span className="text-sm text-tinta-suave">Cantidad</span>
        <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} className="h-10 w-10 rounded-full border text-lg font-bold">
          −
        </button>
        <span className="w-6 text-center text-lg font-bold tabular-nums">{cantidad}</span>
        <button type="button" onClick={() => setCantidad((c) => Math.min(20, c + 1))} className="h-10 w-10 rounded-full border text-lg font-bold">
          ＋
        </button>
        <span className="ml-auto text-lg font-bold tabular-nums">{clp(PRECIO_CONSULTA * cantidad)}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {MEDIOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            onClick={() => setMedio(m.valor)}
            className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${
              medio === m.valor ? "border-tinta bg-tinta text-white" : "border-tinta/20 bg-white"
            }`}
          >
            {m.titulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-tinta-suave">
        Si son varias personas, regístralas por separado si pagaron por separado en la máquina: así cada cobro calza con
        Mercado Pago.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente}
          onClick={registrar}
          className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pendiente ? "Registrando…" : `Registrar ${clp(PRECIO_CONSULTA * cantidad)}`}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-xl border-2 border-tinta/20 px-4 py-3 font-semibold">
          Cancelar
        </button>
      </div>
      {mensaje && <p className="text-sm font-semibold text-red-700">{mensaje}</p>}
    </div>
  );
}
