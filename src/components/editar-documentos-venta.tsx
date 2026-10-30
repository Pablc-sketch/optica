"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { corregirDocumento } from "@/lib/actions/documentos-venta";
import { fechaHoraChile } from "@/lib/fecha-hora-chile";
import { formatearMonto } from "@/lib/formato";

type Pago = { id: string; fecha: string; monto: number; medio_pago: string; numero_voucher: string | null };
const MEDIOS = [
  { valor: "efectivo", titulo: "Efectivo" },
  { valor: "debito", titulo: "Débito" },
  { valor: "credito", titulo: "Crédito" },
  { valor: "transferencia", titulo: "Transferencia" },
];

// Corregir fechas, boleta y abonos de una venta. El administrador además
// puede cambiar el monto y el medio de pago de cada abono.
export default function EditarDocumentosVenta({
  venta,
  admin = false,
}: {
  venta: { id: string; fecha: string; boleta_folio: string | null; boleta_fecha: string | null; ocultar_voucher: boolean; pagos_abonos: Pago[] };
  admin?: boolean;
}) {
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const router = useRouter();
  async function guardar(form: FormData) {
    setOcupado(true);
    const r = await corregirDocumento(form);
    setEstado(r.ok ? "✓ Guardado" : r.error || "Error");
    setOcupado(false);
    if (r.ok) router.refresh();
  }
  const campo = "w-full rounded-lg border bg-white p-2.5 text-base";
  return (
    <section className="space-y-4 print:hidden">
      <div className="space-y-3 rounded-xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Abonos</h2>
        {venta.pagos_abonos.length === 0 && <p className="text-sm text-tinta-suave">Sin abonos.</p>}
        {venta.pagos_abonos.map((p) => (
          <form key={p.id} action={guardar} className="space-y-2 rounded-lg border p-3">
            <input type="hidden" name="venta_id" value={venta.id} />
            <input type="hidden" name="abono_id" value={p.id} />
            {admin ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm font-semibold">
                  Monto
                  <input className={campo} name="monto" inputMode="numeric" required defaultValue={formatearMonto(p.monto)}
                    onChange={(e) => (e.target.value = formatearMonto(e.target.value))} />
                </label>
                <label className="block text-sm font-semibold">
                  Medio
                  <select className={campo} name="medio_pago" defaultValue={p.medio_pago}>
                    {MEDIOS.map((m) => <option key={m.valor} value={m.valor}>{m.titulo}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <p className="font-semibold">${Number(p.monto).toLocaleString("es-CL")} · {p.medio_pago}</p>
            )}
            <label className="block text-sm font-semibold">
              Fecha
              <input className={campo} type="datetime-local" name="fecha" required defaultValue={fechaHoraChile(p.fecha)} />
            </label>
            <label className="block text-sm font-semibold">
              N° de voucher
              <input className={campo} name="numero_voucher" maxLength={80} defaultValue={p.numero_voucher || ""} />
            </label>
            <button disabled={ocupado} className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60">Guardar abono</button>
          </form>
        ))}
      </div>

      <details className="rounded-xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-lg font-bold">Fecha de compra y boleta</summary>
        <form action={guardar} className="mt-3 space-y-3">
          <input type="hidden" name="venta_id" value={venta.id} />
          <label className="block text-sm font-semibold">
            Fecha de compra
            <input className={campo} type="datetime-local" name="fecha" required defaultValue={fechaHoraChile(venta.fecha)} />
          </label>
          <label className="block text-sm font-semibold">
            Folio e-Boleta
            <input className={campo} name="boleta_folio" inputMode="numeric" pattern="[0-9]{1,20}" defaultValue={venta.boleta_folio || ""} />
          </label>
          <label className="block text-sm font-semibold">
            Fecha de la boleta
            <input className={campo} type="date" name="boleta_fecha" defaultValue={venta.boleta_fecha || ""} />
          </label>
          <label className="flex gap-2 text-sm">
            <input type="checkbox" name="ocultar_voucher" defaultChecked={venta.ocultar_voucher} />
            No mostrar los vouchers en los documentos
          </label>
          <button disabled={ocupado} className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-60">Guardar</button>
        </form>
      </details>
      <p role="status" className="text-sm font-semibold">{ocupado ? "Guardando…" : estado}</p>
    </section>
  );
}
