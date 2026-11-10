"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registrarPagoCosto, actualizarCostoFides } from "@/lib/actions/cierre";
import { costoFidesParaPago, type ClaveCosto } from "@/lib/pagos-operativo";
import { clp } from "@/lib/clp";
import { formatearMonto, montoANumero } from "@/lib/formato";

export default function PagoCostoOperativo({ operativoId, clave, titulo, total, pagado, bloqueado = false, costoFidesActual = null,comercial=false }: {
  comercial?:boolean;
  operativoId: string; clave: ClaveCosto | "fides" | "marcos"; titulo: string; total: number; pagado: number; bloqueado?: boolean; costoFidesActual?: number | null;
}) {
  const saldo = Math.max(0, total - pagado);
  const [texto, setTexto] = useState("");
  const [caja, setCaja] = useState<"digital" | "efectivo" | "personal">("digital");
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if(total<=0&&pagado===0&&(comercial||clave!=="fides")) return null;
  const monto = texto ? montoANumero(texto) : saldo;
  const nuevoTotal = comercial?null:costoFidesParaPago(clave, total, pagado, monto);
  return <li className={`rounded-2xl p-4 shadow-sm ${saldo === 0 ? "bg-emerald-50" : "bg-white"}`}>
    <div className="flex flex-wrap justify-between gap-2"><b>{titulo}</b><b>{saldo > 0 ? `${clp(saldo)} pendiente` : "Pagado ✓"}</b></div>
    <p className="text-sm text-tinta-suave">Total {clp(total)} · Pagado {clp(pagado)}</p>
    {(saldo > 0 || clave === "fides") && <div className="mt-3 flex flex-wrap gap-2">
      <input aria-label={`Monto a pagar: ${titulo}`} inputMode="numeric" value={texto} placeholder={formatearMonto(saldo)}
        disabled={pendiente} onChange={(e) => { setTexto(formatearMonto(e.target.value)); setAviso(null); }} className="min-w-0 flex-1 rounded-xl border p-3" />
      <select disabled={pendiente} aria-label={`Caja: ${titulo}`} value={caja} onChange={(e) => setCaja(e.target.value as typeof caja)} className="rounded-xl border bg-white p-3">
        <option value="digital">Cuenta bancaria (Mercado Pago)</option><option value="efectivo">Efectivo</option><option value="personal">{comercial?"Dinero personal por reembolsar":"Dinero personal de Pablo"}</option>
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
    {nuevoTotal !== null && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-amber-950">
      <p className="text-sm">El pago supera el costo registrado. Confirma el costo real de Fides: <b>{clp(nuevoTotal)}</b>{pagado > 0 ? ` (incluye ${clp(pagado)} ya pagados)` : ''}.</p>
      <button disabled={bloqueado || pendiente} className="mt-2 rounded-xl bg-tinta px-4 py-3 font-semibold text-white disabled:opacity-40" onClick={() => iniciar(async () => {
        setError(null); setAviso(null);
        try {
          const f = new FormData();
          f.set('operativo_id', operativoId); f.set('monto', String(nuevoTotal));
          f.set('anterior', String(costoFidesActual ?? ''));
          f.set('nota', `Costo real de Fides mayor al previsto; total ${clp(nuevoTotal)}. Informado al registrar pago.`);
          const r = await actualizarCostoFides({}, f);
          if (r.error) setError(r.error);
          else { setAviso('Costo actualizado. Ahora pulsa Registrar pago.'); router.refresh(); }
        } catch { setError('No se pudo actualizar el costo. Recarga y revisa antes de reintentar.'); }
      })}>{pendiente ? 'Guardando…' : `Actualizar costo a ${clp(nuevoTotal)}`}</button>
      <p className="mt-2 text-xs">Primero actualiza el costo y la ganancia; después registra el pago.</p>
    </div>}
    {monto > saldo && clave !== 'fides' && <p className="mt-2 text-sm text-amber-900">El monto supera el pendiente. Corrige primero el costo del operativo.</p>}
    {aviso && <p role="status" className="mt-2 text-sm text-emerald-800">{aviso}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </li>;
}
