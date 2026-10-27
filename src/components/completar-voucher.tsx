"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { actualizarVoucherAbono } from "@/lib/actions/ventas";
import CampoVoucher from "./campo-voucher";

export default function CompletarVoucher({ abonoId }: { abonoId: string }) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <form action={(formData) => iniciar(async () => {
      setError(null);
      try { await actualizarVoucherAbono(formData); router.refresh(); }
      catch { setError("No se pudo guardar. Revisa el número e intenta de nuevo."); }
    })} className="mt-2 flex flex-col gap-2 rounded-xl bg-amber-50 p-3 print:hidden">
      <input type="hidden" name="abono_id" value={abonoId} />
      <CampoVoucher value={numero} onChange={setNumero} disabled={pendiente} />
      <button disabled={pendiente} className="self-start rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{pendiente ? "Guardando…" : "Guardar voucher de este abono"}</button>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
  );
}
