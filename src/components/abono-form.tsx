"use client";

import { useState } from "react";
import { registrarAbono } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { CampoMonto } from "@/components/campos";

// Formulario de abono con un botón "Todo" que autocompleta el saldo
// pendiente completo — para cuando el paciente vuelve a pagar el resto y
// no hay que escribir el monto ni hacer la cuenta a mano.
export default function AbonoForm({
  ventaId,
  saldo,
  compacto,
}: {
  ventaId: string;
  saldo: number;
  compacto?: boolean;
}) {
  const [montoInicial, setMontoInicial] = useState<number | undefined>(undefined);

  return (
    <form action={registrarAbono} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="venta_id" value={ventaId} />
      {!compacto && (
        <span className="text-xs text-tinta-suave">
          Saldo: <b>{clp(saldo)}</b>
        </span>
      )}
      <CampoMonto
        name="monto"
        defaultValue={montoInicial}
        placeholder={compacto ? `Cobrar hasta ${clp(saldo)}` : "Monto"}
        className="w-24 flex-1 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
      />
      <button
        type="button"
        onClick={() => setMontoInicial(saldo)}
        className="rounded-lg border border-brand/30 px-2 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand/10"
      >
        Todo
      </button>
      <select
        name="medio_pago"
        className="rounded-lg border border-tinta-suave/30 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand"
      >
        <option value="efectivo">Efectivo</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
        <option value="transferencia">Transferencia</option>
      </select>
      <button className="rounded-lg bg-brand/10 px-2 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
        {compacto ? "Cobrar" : "Abonar"}
      </button>
    </form>
  );
}
