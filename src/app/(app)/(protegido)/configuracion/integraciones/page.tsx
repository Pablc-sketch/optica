import Link from "next/link";
import { exigirRolPagina } from "@/lib/autorizacion";
import { leerMercadoPago } from "@/lib/mercadopago-lectura";
import { clp } from "@/lib/clp";
import { fechaLegible, diaEnChile } from "@/lib/fechas";

export default async function Integraciones() {
  const { tenantId } = await exigirRolPagina(["admin"]);
  const mp = await leerMercadoPago(tenantId);
  const estados: Record<string, string> = { approved: "Aprobado", pending: "Pendiente", rejected: "Rechazado", refunded: "Devuelto", cancelled: "Cancelado", in_process: "En proceso" };
  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <Link href="/" className="text-sm underline">← Inicio</Link><h1 className="text-2xl font-bold">Cuentas y boletas</h1>
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold">Mercado Pago</h2>
      <p className="mt-1 text-sm">{mp.estado === "pendiente" ? "Pendiente de vincular la cuenta de la óptica." : mp.estado === "error" ? "No se pudo consultar. Revisa la conexión y vuelve a intentar." : "Conectado · consulta de pagos"}</p>
      {mp.estado === "conectado" && <><p className="mt-2 text-xs text-tinta-suave">Pagos recientes de Mercado Pago. No se suman nuevamente a caja ni representan el saldo de tu cuenta.</p>
        {mp.pagos.length === 0 ? <p className="mt-2 text-sm">Sin pagos recientes en pesos chilenos.</p> : <ul className="mt-2 divide-y">{mp.pagos.map((p) => <li key={p.id} className="flex justify-between gap-2 py-3 text-sm"><span>#{p.id} · {fechaLegible(diaEnChile(p.fecha))}<span className="block text-xs">{estados[p.estado] ?? p.estado}</span></span><b>{clp(p.monto)}</b></li>)}</ul>}</>}
      {mp.estado === "pendiente" && <a href="https://www.mercadopago.cl/developers/panel/app" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-xl border px-4 py-2 font-semibold">Abrir Mercado Pago ↗</a>}
    </section>
    <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Cuenta bancaria</h2><p className="mt-1 text-sm">Sin conectar. Falta identificar el banco y la cuenta de la óptica.</p></section>
    <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="text-lg font-bold">Boletas electrónicas · SimpleAPI</h2>
      <p className="mt-1 text-sm">Sin activar. Requiere API Key, certificado digital, folios CAF y habilitación del emisor ante el SII.</p>
      <p className="mt-2 text-sm text-tinta-suave">Prueba: 500 peticiones al mes durante 12 meses. Una boleta puede consumir varias peticiones.</p>
      <a href="https://www.simpleapi.cl/Productos/SimpleAPI" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-xl border px-4 py-2 font-semibold">Ver plan y requisitos ↗</a>
    </section>
  </div>;
}
