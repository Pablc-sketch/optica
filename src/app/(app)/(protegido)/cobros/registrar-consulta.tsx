"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarConsulta } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { PRECIO_CONSULTA } from "@/lib/consulta";
import CampoVoucher from "@/components/campo-voucher";
import { requiereVoucher, validarVoucher } from "@/lib/voucher";

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
  const [medio, setMedio] = useState<string>("") // se elige en cada cobro, sin valor por defecto;
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [numeroVoucher, setNumeroVoucher] = useState("");
  const [pendiente, iniciar] = useTransition();
  const id = useRef<string | null>(null);

  function registrar() {
    iniciar(async () => {
      id.current ??= crypto.randomUUID();
      const r = await registrarConsulta({ consultaId: id.current, operativoId, monto: PRECIO_CONSULTA, medioPago: medio, cantidad, numeroVoucher });
      if (r.ok) {
        id.current = null;
        setAbierto(false);
        setCantidad(1);
        setMedio("");
        setNumeroVoucher("");
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
          <span className="block text-sm font-normal text-tinta-suave">Solo si NO compra lentes</span>
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
      {/* Regla de Pablo (20-10-2026): si compra lentes, la consulta va
          incluida en el paquete; solo paga $5.000 quien no compra. */}
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <b>Solo para quien no compra lentes.</b> Si compra lentes, va incluida.
      </p>
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
      {requiereVoucher(medio) && <CampoVoucher value={numeroVoucher} onChange={setNumeroVoucher} disabled={pendiente} />}
      <p className="text-xs text-tinta-suave">
        Si pagaron por separado, regístralos por separado.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pendiente || !medio || Boolean(validarVoucher(medio, PRECIO_CONSULTA * cantidad, numeroVoucher).error)}
          onClick={registrar}
          className="flex-1 rounded-xl bg-brand px-4 py-3 text-base font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
        >
          {pendiente ? "Registrando…" : !medio ? "Elige cómo paga" : validarVoucher(medio, PRECIO_CONSULTA * cantidad, numeroVoucher).error ? "Completa el voucher" : `Registrar ${clp(PRECIO_CONSULTA * cantidad)}`}
        </button>
        <button type="button" onClick={() => setAbierto(false)} className="rounded-xl border-2 border-tinta/20 px-4 py-3 font-semibold">
          Cancelar
        </button>
      </div>
      {mensaje && <p className="text-sm font-semibold text-red-700">{mensaje}</p>}
    </div>
  );
}
