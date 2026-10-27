"use client";

import { useId } from "react";
import { validarVoucher } from "@/lib/voucher";

export default function CampoVoucher({ value, onChange, disabled }: {
  value?: string; onChange?: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const error = value?.trim() ? validarVoucher("debito", 1, value).error : undefined;
  return (
    <label htmlFor={id} className="flex w-full flex-col gap-1 text-sm font-semibold">
      Número de voucher de Mercado Pago
      <input id={id} name="numero_voucher" value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        disabled={disabled} required maxLength={80} autoComplete="off" spellCheck={false}
        placeholder="Número de operación impreso en el voucher"
        className="w-full rounded-xl border border-tinta-suave/30 bg-white px-3 py-2.5 font-normal text-tinta outline-none focus:border-brand" />
      <span className="text-xs font-normal text-tinta-suave">Copia el número de este pago. Cada abono tiene su propio voucher. No ingreses el número de tarjeta.</span>
      {error && <span className="text-xs font-normal text-red-800">{error}</span>}
    </label>
  );
}
