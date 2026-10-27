"use client";

import { useRef, useState } from "react";
import { registrarAbono } from "@/lib/actions/ventas";
import { clp } from "@/lib/clp";
import { CampoMonto } from "@/components/campos";
import CampoVoucher from "@/components/campo-voucher";
import { requiereVoucher } from "@/lib/voucher";

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
  const [medio, setMedio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Id de esta operación: si el formulario se envía dos veces (doble clic,
  // reintento), la base cobra una sola vez. Se crea al primer envío y se
  // renueva al terminar (en un ref, no en el HTML, para que el servidor y
  // el navegador no rendericen ids distintos).
  const operacionId = useRef<string | null>(null);

  return (
    <form
      onSubmit={async (evento) => {
        evento.preventDefault();
        const formulario = evento.currentTarget;
        const formData = new FormData(formulario);
        if (guardando) return;
        setGuardando(true);
        setError(null);
        operacionId.current ??= crypto.randomUUID();
        formData.set("operacion_id", operacionId.current);
        try {
          const resultado = await registrarAbono(formData);
          if (!resultado.ok) { setError(resultado.error ?? "No se pudo registrar el abono."); return; }
          operacionId.current = null;
          setMontoInicial(undefined);
          setMedio("");
          formulario.reset();
        } catch { setError("No se pudo confirmar el abono. Reintenta sin volver a cobrar en la máquina."); }
        finally { setGuardando(false); }
      }}
      className="flex flex-wrap items-center gap-1.5"
    >
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
        value={medio}
        onChange={(e) => setMedio(e.target.value)}
        disabled={guardando}
        required
        aria-label="Medio de pago del abono"
        className="rounded-lg border border-tinta-suave/30 bg-white px-1.5 py-1 text-xs outline-none focus:border-brand"
      >
        <option value="" disabled>Cómo paga</option>
        <option value="efectivo">Efectivo</option>
        <option value="debito">Débito</option>
        <option value="credito">Crédito</option>
        <option value="transferencia">Transferencia</option>
      </select>
      {requiereVoucher(medio) && <CampoVoucher disabled={guardando} />}
      {error && <p role="alert" className="w-full text-xs text-red-800">{error}</p>}
      <button disabled={guardando} className="rounded-lg bg-brand/10 px-2 py-1 text-xs font-semibold text-brand-dark transition hover:bg-brand hover:text-white disabled:opacity-50">
        {compacto ? "Cobrar" : "Abonar"}
      </button>
    </form>
  );
}
