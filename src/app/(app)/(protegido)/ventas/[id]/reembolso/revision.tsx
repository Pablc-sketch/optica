"use client";

import Link from "next/link";
import { useState } from "react";
import { compararEmisor, pendientesCompra, GUIAS_REEMBOLSO, type CompraReembolso } from "@/lib/reembolso";
import { requiereVoucher } from "@/lib/voucher";
import { formatearRut } from "@/lib/rut";
import { clp } from "@/lib/clp";
import { diaEnChile, fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";

export default function RevisionReembolso({ compra }: { compra: CompraReembolso }) {
  const [entidad, setEntidad] = useState<keyof typeof GUIAS_REEMBOLSO>("banmedica");
  const [emisores, setEmisores] = useState<Record<string, string>>({});
  const [revisados, setRevisados] = useState<Record<string, boolean>>({});
  const guia = GUIAS_REEMBOLSO[entidad];
  const pendientes = pendientesCompra(compra);
  const tarjetas = compra.pagos.filter(p => requiereVoucher(p.medio_pago, p.monto));
  const distintos = tarjetas.filter(p => compararEmisor(compra.optica?.rut_empresa, emisores[p.id] ?? "") === "distinto");
  const emisoresPendientes = tarjetas.filter(p => compararEmisor(compra.optica?.rut_empresa, emisores[p.id] ?? "") !== "coincide");
  const pasos = [
    { id: "receta", texto: "Receta legible del paciente: nombre, RUT, fecha, prescripción y datos/firma del profesional; cumple la vigencia exigida." },
    { id: "tributario", texto: "Documento tributario válido según el modelo de emisión del comercio, con su folio o referencia y los respaldos de todos los abonos." },
    { id: "detalle", texto: "Desglose revisado: marco, cristales, tipo y tratamiento, precios reales, descuentos, total y pagos con sus fechas." },
    { id: "cobertura", texto: entidad === "fonasa" ? "Beneficio, tramo, edad a la fecha de compra y requisitos actuales confirmados con Fonasa; cédula y certificado de compra firmado y timbrado cuando corresponda." : entidad === "banmedica" ? "Requisitos del plan Banmédica revisados; si hubo rechazo, tengo la comunicación y respondí a todos sus puntos." : "Póliza y formulario de la aseguradora revisados; incorporé la liquidación o constancia de previsión que exige ese seguro." },
  ];
  const faltantes = pasos.filter(p => !revisados[p.id]);
  const completo = pendientes.length === 0 && emisoresPendientes.length === 0 && faltantes.length === 0;

  return <div className="mx-auto flex max-w-3xl flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><Link href="/seguros" className="text-sm underline print:hidden">← Seguros</Link><h1 className="text-2xl font-bold">Preparar reembolso</h1></div>
      <div className="print:hidden"><BotonImprimir /></div>
    </div>
    <p className="text-sm">{compra.paciente?.nombre} · {formatearRut(compra.paciente?.rut)}<br />Compra del {fechaLegible(diaEnChile(compra.fecha))} · {clp(compra.total)}<br />{compra.optica?.razon_social || "Falta razón social"} · {formatearRut(compra.optica?.rut_empresa)}</p>
    <p className="rounded-xl bg-crema-claro p-3 text-sm">Revisión de esta sesión: las casillas y RUT que escribas aquí no se guardan ni corrigen vouchers. Puedes guardar esta hoja como PDF para conservar la revisión. No acredita aprobación ni sustituye la boleta.</p>
    <label className="font-semibold" htmlFor="entidad-reembolso">1. ¿Dónde se presentará?</label>
    <select id="entidad-reembolso" value={entidad} onChange={e => { setEntidad(e.target.value as keyof typeof GUIAS_REEMBOLSO); setRevisados({}); }} className="rounded-xl border border-tinta-suave/30 bg-white p-3 print:hidden">
      {Object.entries(GUIAS_REEMBOLSO).map(([id, g]) => <option key={id} value={id}>{g.nombre}</option>)}
    </select>
    <p className="hidden font-semibold print:block">Entidad: {guia.nombre}</p>
    <p className="text-sm">{guia.texto} <a href={guia.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Guía oficial</a></p>
    <section className="rounded-xl border border-tinta-suave/20 p-4">
      <h2 className="font-bold">2. Revisa la compra</h2>
      <ul className="mt-2 space-y-2 text-sm">{compra.items.map((i, n) => <li key={n}>{i.cantidad} × {i.descripcion} · unitario {clp(i.precio_unitario)} · descuento {clp(i.descuento)} · subtotal {clp(i.cantidad * i.precio_unitario - i.descuento)}</li>)}</ul>
      {pendientes.length > 0 ? <ul className="mt-3 list-inside list-disc space-y-1 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{pendientes.map(p => <li key={p}>{p}</li>)}</ul> : <p className="mt-2 text-sm">Los datos registrados no muestran pendientes automáticos. Coteja el detalle con la receta y los originales.</p>}
      <div className="mt-3 flex flex-wrap gap-2 text-sm print:hidden"><Link href={`/ventas/${compra.id}/comprobante`} className="rounded-lg bg-brand px-3 py-2 font-semibold text-white">Abrir desglose y completar vouchers</Link><Link href={`/ventas/${compra.id}`} className="rounded-lg border p-2">Revisar venta</Link>{entidad === "fonasa" && <Link href={`/ventas/${compra.id}/certificado-fonasa`} className="rounded-lg border p-2">Certificado de compra Fonasa</Link>}</div>
    </section>
    <section className="rounded-xl border border-tinta-suave/20 p-4">
      <h2 className="font-bold">3. Coteja cada pago con su original</h2>
      <p className="mt-1 text-sm">Copia el RUT del comercio impreso en cada voucher, no el del paciente ni los dígitos de su tarjeta. No lo deduzcas del certificado de Lentia.</p>
      {compra.pagos.map(p => {
        const tarjeta = requiereVoucher(p.medio_pago, p.monto);
        const estado = compararEmisor(compra.optica?.rut_empresa, emisores[p.id] ?? "");
        return <div key={p.id} className="mt-3 rounded-lg bg-crema-claro p-3 text-sm">
          <p className="font-semibold">{fechaLegible(diaEnChile(p.fecha))} · {clp(p.monto)} · {p.medio_pago}</p>
          <p>Voucher registrado: {p.numero_voucher || "sin número"}</p>
          {tarjeta ? <><label htmlFor={`emisor-${p.id}`} className="mt-2 block">RUT del comercio en el voucher original</label><input id={`emisor-${p.id}`} value={emisores[p.id] ?? ""} onChange={e => setEmisores({ ...emisores, [p.id]: e.target.value })} maxLength={12} autoComplete="off" placeholder="Copiar del original" className="mt-1 w-full rounded-lg border bg-white p-2 print:hidden" /><p className="hidden print:block">RUT cotejado: {emisores[p.id] || "no informado"}</p><p aria-live="polite" className={`mt-1 font-semibold ${estado === "coincide" ? "text-green-800" : "text-amber-900"}`}>{estado === "coincide" ? "Coincide con el RUT configurado de la óptica; verifica también el documento tributario." : estado === "distinto" ? "RUT distinto: resuelve la discrepancia antes de presentar los respaldos." : estado === "invalido" ? "Revisa ambos RUT: formato o dígito verificador inválido." : "Pendiente de cotejar con el original."}</p></> : <p className="mt-1">Conserva el respaldo del pago y la boleta correspondiente. Una transferencia no sustituye la boleta.</p>}
        </div>;
      })}
      {compra.pagos.length === 0 && <p className="mt-2 text-sm">No hay pagos registrados.</p>}
    </section>
    {distintos.length > 0 && <p role="alert" className="rounded-xl bg-amber-100 p-4 text-sm font-semibold text-amber-900">Hay {distintos.length} voucher(s) con otro RUT. No cambies el RUT de la óptica ni el original para que coincidan. Sigue el procedimiento de discrepancia que aparece abajo.</p>}
    <fieldset className="rounded-xl border border-tinta-suave/20 p-4"><legend className="px-1 font-bold">4. Reúne y coteja los documentos</legend><div className="space-y-3">{pasos.map(p => <label key={p.id} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={!!revisados[p.id]} onChange={e => setRevisados({ ...revisados, [p.id]: e.target.checked })} className="mt-1 size-4 shrink-0 print:hidden" /><span className="hidden print:inline">{revisados[p.id] ? "[Revisado]" : "[Pendiente]"}</span><span>{p.texto}</span></label>)}</div></fieldset>
    <p role="status" className="rounded-xl bg-crema-claro p-4 font-semibold">{completo ? "Revisión completada en esta sesión. La entidad evalúa la cobertura y puede pedir otros antecedentes." : `Revisión pendiente: ${pendientes.length} aviso(s) de compra, ${emisoresPendientes.length} emisor(es) por resolver y ${faltantes.length} documento(s) por cotejar.`}</p>
    <details className="rounded-xl border border-tinta-suave/20 p-4 text-sm open:space-y-3">
      <summary className="cursor-pointer font-bold">Si el voucher tiene el RUT personal: quién debe hacer qué</summary>
      <ol className="list-inside list-decimal space-y-2">
        <li>Recupera cada voucher original, fecha, monto y número de operación. Conserva la venta y el rechazo escrito de la entidad.</li>
        <li>Mercado Pago: solicita un caso por cobro de una venta de empresa en cuenta personal. Pide por escrito el RUT informado al SII para cada operación y el procedimiento disponible para rectificar datos del comercio. Pide número de caso y respuesta escrita si no es posible.</li>
        <li>Contador: entrega ambas identidades y esos respaldos. Pide revisar el modelo de emisión y los registros de ambos RUT, determinar cómo documentar la venta real de la empresa y qué corrección del RCV/F29 corresponde para evitar omisiones o duplicación. Que indique por escrito el procedimiento y su respaldo.</li>
        <li>Si no hay una vía clara de rectificación entre contribuyentes, presenta los antecedentes al SII y pide orientación específica antes de emitir documentos o corregir registros. Después consulta a la entidad qué documentación regularizada permite revisar el rechazo.</li>
      </ol>
      <p>El SII distingue corregir boletas mediante nota de crédito de las inconsistencias de vouchers en el RCV. Esa regla no autoriza por sí sola trasladar una venta entre RUT. Transferir dinero o abrir una cuenta empresa no demuestra que cambie el emisor histórico. No hagas un nuevo cobro para fabricar un respaldo.</p>
      <p><a href="https://www.sii.cl/destacados/boleta_electronica_voucher/index.html" target="_blank" rel="noopener noreferrer" className="underline">SII: modelos y correcciones</a> · <a href="https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_8093.htm" target="_blank" rel="noopener noreferrer" className="underline">SII: inconsistencias de vouchers</a></p>
      <p>Si e-Boleta indica que no tienes un emisor registrado, revisa la autorización del usuario para operar por la empresa. Es un problema distinto al RUT del voucher. <a href="https://www.sii.cl/preguntas_frecuentes/factura_electronica/001_003_7814.htm" target="_blank" rel="noopener noreferrer" className="underline">Explicación del SII</a>.</p>
    </details>
    <p className="text-xs text-tinta-suave">Guías consultadas el 27 de octubre de 2026. Revisa las condiciones vigentes de la entidad al presentar.</p>
  </div>;
}
