"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cobrarSaldo, entregarVenta } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { formatearMonto, montoANumero } from "@/lib/formato";

export type FilaCobro = {
  ventaId: string;
  nombre: string;
  telefono: string | null;
  total: number;
  pagado: number;
  saldo: number;
  listos: number;
  enProceso: number;
  entregados: number;
};

const MEDIOS = [
  { valor: "efectivo", titulo: "Efectivo" },
  { valor: "transferencia", titulo: "Transferencia" },
  { valor: "debito", titulo: "Débito" },
  { valor: "credito", titulo: "Crédito" },
] as const;

// Una persona por tarjeta: cuánto debe, si su lente está listo, y los dos
// botones que importan en la entrega: cobrar y entregar.
export default function TarjetaCobro({ fila }: { fila: FilaCobro }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState(formatearMonto(fila.saldo));
  const [medio, setMedio] = useState<string>("efectivo");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const operacion = useRef<string | null>(null);

  const digitos = String(fila.telefono ?? "").replace(/\D/g, "");
  const estado =
    fila.listos > 0
      ? { texto: fila.enProceso > 0 ? `${fila.listos} listo · ${fila.enProceso} en laboratorio` : "Lente listo", clase: "bg-emerald-700 text-white" }
      : fila.enProceso > 0
        ? { texto: "En laboratorio", clase: "bg-amber-100 text-amber-900" }
        : fila.entregados > 0
          ? { texto: "Entregado", clase: "bg-neutral-200 text-neutral-700" }
          : null;

  function cobrar() {
    const n = montoANumero(monto);
    iniciar(async () => {
      operacion.current ??= crypto.randomUUID();
      const r = await cobrarSaldo({ ventaId: fila.ventaId, operacionId: operacion.current, monto: n, medioPago: medio });
      if (r.ok) {
        operacion.current = null;
        setAbierto(false);
        setMensaje(`✓ Cobrado ${clp(r.aplicado ?? n)}`);
        router.refresh();
      } else {
        setMensaje(r.error ?? "No se pudo cobrar");
      }
    });
  }

  function entregar() {
    iniciar(async () => {
      const r = await entregarVenta(fila.ventaId);
      setMensaje(r.ok ? "✓ Marcado como entregado" : (r.error ?? "No se pudo marcar"));
      if (r.ok) router.refresh();
    });
  }

  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold break-words">{fila.nombre}</p>
          {estado && (
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${estado.clase}`}>
              {estado.texto}
            </span>
          )}
        </div>
        <div className="shrink-0 text-right">
          {fila.saldo > 0 ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-red-700">Debe</p>
              <p className="text-2xl font-bold text-red-700 tabular-nums">{clp(fila.saldo)}</p>
            </>
          ) : (
            <p className="text-lg font-bold text-emerald-700">Pagado</p>
          )}
          <p className="text-xs text-tinta-suave tabular-nums">
            de {clp(fila.total)} · pagó {clp(fila.pagado)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {fila.saldo > 0 && !abierto && (
          <button
            type="button"
            onClick={() => {
              setAbierto(true);
              setMensaje(null);
            }}
            className="flex-1 rounded-xl bg-emerald-800 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-900"
          >
            Cobrar
          </button>
        )}
        {fila.listos > 0 && (
          <button
            type="button"
            disabled={pendiente}
            onClick={entregar}
            className="flex-1 rounded-xl border-2 border-tinta/20 px-4 py-3 text-base font-semibold hover:bg-crema disabled:opacity-50"
          >
            Entregar
          </button>
        )}
        {digitos.length >= 8 && (
          <a
            href={`tel:+${digitos.startsWith("56") ? digitos : `56${digitos}`}`}
            className="rounded-xl border-2 border-tinta/20 px-4 py-3 text-base font-semibold hover:bg-crema"
            aria-label={`Llamar a ${fila.nombre}`}
          >
            📞
          </a>
        )}
      </div>

      {abierto && (
        <div className="mt-3 flex flex-col gap-3 rounded-xl bg-emerald-50 p-3">
          <label className="flex flex-col gap-1 text-sm font-semibold text-emerald-900">
            ¿Cuánto paga?
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tinta-suave">$</span>
              <input
                inputMode="numeric"
                value={monto}
                onChange={(e) => setMonto(formatearMonto(e.target.value))}
                className="w-full rounded-xl border bg-white py-3 pl-7 text-xl font-bold tabular-nums outline-none focus:border-emerald-700"
              />
            </div>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {MEDIOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setMedio(m.valor)}
                className={`rounded-full border px-3.5 py-2 text-sm font-semibold ${
                  medio === m.valor ? "border-emerald-800 bg-emerald-800 text-white" : "border-emerald-800/25 bg-white text-emerald-900"
                }`}
              >
                {m.titulo}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pendiente || montoANumero(monto) <= 0}
              onClick={cobrar}
              className="flex-1 rounded-xl bg-emerald-800 px-4 py-3 text-base font-semibold text-white hover:bg-emerald-900 disabled:opacity-50"
            >
              {pendiente ? "Registrando…" : `Registrar pago de ${clp(montoANumero(monto))}`}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-xl border-2 border-tinta/20 px-4 py-3 text-base font-semibold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mensaje && (
        <p className={`mt-2 text-sm font-semibold ${mensaje.startsWith("✓") ? "text-emerald-800" : "text-red-700"}`}>{mensaje}</p>
      )}
    </li>
  );
}
