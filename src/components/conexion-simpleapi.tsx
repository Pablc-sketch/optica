"use client";

import { useState } from "react";
import { comprobarConexionSimpleApi } from "@/lib/actions/simpleapi";
import type { EstadoSimpleApi } from "@/lib/simpleapi";

export default function ConexionSimpleApi({ configurada }: { configurada: boolean }) {
  const [resultado, setResultado] = useState<EstadoSimpleApi | null>(null);
  const [consultando, setConsultando] = useState(false);
  async function comprobar() {
    setConsultando(true);
    try {
      setResultado(await comprobarConexionSimpleApi());
    } catch {
      setResultado({ estado: "error" });
    } finally {
      setConsultando(false);
    }
  }
  let mensaje = configurada ? "Clave guardada. Comprueba la conexión para consultar el plan." : "Pendiente de conectar la cuenta de esta óptica.";
  if (resultado?.estado === "conectado") mensaje = "Conexión verificada con SimpleAPI.";
  if (resultado?.estado === "sin_acceso") mensaje = "SimpleAPI no autorizó la consulta. Revisa la clave y el plan de la cuenta.";
  if (resultado?.estado === "limite") mensaje = "SimpleAPI alcanzó su límite de consultas. Espera antes de comprobar nuevamente.";
  if (resultado?.estado === "error") mensaje = "No se pudo comprobar la conexión. Revisa tu acceso y vuelve a intentar.";
  if (resultado?.estado === "pendiente") mensaje = "La conexión no está configurada para esta óptica.";

  return <div className="mt-2 space-y-3">
    <div role="status" aria-live="polite" aria-busy={consultando}>
      <p className="text-sm">{consultando ? "Comprobando conexión…" : mensaje}</p>
      {!consultando && resultado?.estado === "conectado" && <>
        <p className="mt-1 text-sm">Peticiones usadas este mes: {resultado.uso.toLocaleString("es-CL")} de {resultado.maximo.toLocaleString("es-CL")}.</p>
        {resultado.uso >= resultado.maximo && <p className="mt-1 text-sm font-semibold text-amber-900">Cupo mensual agotado. Revisa tu plan antes de emitir.</p>}
      </>}
    </div>
    {configurada && <button type="button" onClick={comprobar} disabled={consultando} className="rounded-xl border px-4 py-2 font-semibold disabled:opacity-50">{consultando ? "Consultando…" : "Comprobar conexión"}</button>}
    <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Emisión de boletas pendiente</p>
      <p className="mt-1">Para continuar faltan el certificado digital, los folios CAF y verificar la habilitación del emisor ante el SII. Esta conexión consulta el plan; todavía no emite boletas.</p>
    </div>
    <p className="text-xs text-tinta-suave">Las peticiones no equivalen a boletas: una emisión puede necesitar varias consultas.</p>
  </div>;
}
