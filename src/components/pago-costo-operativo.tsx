"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarPagoCosto } from "@/lib/actions/cierre";
import type { ClaveCosto } from "@/lib/pagos-operativo";
import { clp } from "@/lib/clp";
import { formatearMonto, montoANumero } from "@/lib/formato";

export default function PagoCostoOperativo({ operativoId, clave, titulo, total, pagado, bloqueado = false }: {
  operativoId: string; clave: ClaveCosto | "fides" | "marcos"; titulo: string; total: number; pagado: number; bloqueado?: boolean;
}) {
  const saldo = Math.max(0, total - pagado);
  const [texto, setTexto] = useState("");
  const [caja, setCaja] = useState<"digital" | "efectivo">("digital");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (total <= 0 && pagado === 0) return null;
  const monto = texto ? montoANumero(texto) : saldo;
  return <li className={`rounded-2xl p-4 shadow-sm ${saldo === 0 ? "bg-emerald-50" : "bg-white"}`}>
    <div className="flex flex-wrap justify-between gap-2"><b>{titulo}</b><b>{saldo > 0 ? `${clp(saldo)} pendiente` : "Pagado ✓"}</b></div>
    <p className="text-sm text-tinta-suave">Total {clp(total)} · Pagado {clp(pagado)}</p>
    {saldo > 0 && <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label={`Monto a pagar: ${titulo}`} inputMode="numeric" value={texto} placeholder={formatearMonto(saldo)}
        disabled={pendiente} onChange={(e) => setTexto(formatearMonto(e.target.value))} className="min-w-0 flex-1 rounded-xl border p-3" />
      <select disabled={pendiente} aria-label={`Caja: ${titulo}`} value={caja} onChange={(e) => setCaja(e.target.value as typeof caja)} className="rounded-xl border bg-white p-3">
        <option value="digital">Cuenta</option><option value="efectivo">Efectivo</option>
      </select>
      <button disabled={bloqueado || pendiente || monto <= 0 || monto > saldo} className="rounded-xl bg-emerald-800 px-4 py-3 font-semibold text-white disabled:opacity-40"
        onClick={() => {
          iniciar(async () => {
            setError(null);
            try {
              const r = await registrarPagoCosto({ operativoId, clave, monto, caja, pagadoEsperado: pagado });
              if (!r.ok) setError(r.error ?? "No se pudo registrar");
              else { setTexto(""); router.refresh(); }
            } catch { setError("No se pudo confirmar. Reintenta sin cambiar el monto."); }
          });
        }}>{pendiente ? "Guardando…" : "Registrar pago"}</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </li>;
}
