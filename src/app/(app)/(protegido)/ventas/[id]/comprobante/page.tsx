import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { diaEnChile, edadEnAnios, fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";
import CopiarParaSII from "@/components/copiar-para-sii";
import AnularVenta from "../../anular-venta";
import CompletarVoucher from "@/components/completar-voucher";
import { requiereVoucher, validarVoucher } from "@/lib/voucher";

// Comprobante de venta imprimible (uso interno / respaldo para el cliente).
// NOTA: no es boleta electrónica del SII — esa se emite vía un proveedor
// DTE certificado (OpenFactura, LibreDTE, Bsale) cuando se integre; este
// comprobante queda como respaldo imprimible mientras tanto.

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, tenantId } = await exigirRolPagina(["admin", "ventas"]);

  const [ventaRes, tenantRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, fecha, total, estado_pago, anulada, anulada_motivo,
         pacientes:paciente_id (nombre, rut, fecha_nacimiento),
         venta_items (descripcion, cantidad, precio_unitario, descuento, cristal_slot,
           ordenes_trabajo:ot_id (folio, tipo_lente, tratamiento, posicion, tipo_lente_2, tratamiento_2, posicion_2)),
         pagos_abonos (id, monto, medio_pago, fecha, numero_voucher)`
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single(),
    supabase.from("tenants").select("nombre_comercial, razon_social, rut_empresa, telefono, direccion, logo_url").eq("id", tenantId).single(),
  ]);

  const venta = ventaRes.data;
  if (!venta) notFound();

  const optica = tenantRes.data;
  const paciente = venta.pacientes as unknown as {
    nombre: string;
    rut: string | null;
    fecha_nacimiento: string | null;
  } | null;
  // El certificado de Fonasa solo le sirve a mayores de 55 años: bajo esa
  // edad no hay reembolso, así que el botón ni aparece para no hacer
  // perder el viaje.
  const edadPaciente = paciente?.fecha_nacimiento
    ? edadEnAnios(paciente.fecha_nacimiento, diaEnChile(venta.fecha))
    : null;
  const puedeFonasa = edadPaciente !== null && edadPaciente >= 55;
  const items = venta.venta_items ?? [];
  const pagos = [...(venta.pagos_abonos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const abonado = pagos.reduce((s: number, p: { monto: number }) => s + p.monto, 0);
  const saldo = venta.total - abonado;
  const sinVoucher = pagos.filter((p) => requiereVoucher(p.medio_pago, p.monto) && validarVoucher(p.medio_pago, p.monto, p.numero_voucher).error);
  // La relación llega como objeto o arreglo según el shape que infiera
  // supabase-js; normalizamos antes de listar los folios.
  const folios = [
    ...new Set(
      items.flatMap((i) => {
        const rel = (i as { ordenes_trabajo?: unknown }).ordenes_trabajo;
        const filas = (Array.isArray(rel) ? rel : rel ? [rel] : []) as { folio: number }[];
        return filas.map((f) => f.folio).filter((f): f is number => typeof f === "number");
      })
    ),
  ];

  // Texto listo para pegar en el portal del SII (a nombre del paciente:
  // es lo que exige la isapre para reembolsar lentes ópticos).
  const textoSII = [
    `Cliente: ${paciente?.nombre ?? "Consumidor final"}`,
    paciente?.rut ? `RUT: ${formatearRut(paciente.rut)}` : null,
    `Fecha: ${fechaLegible(diaEnChile(venta.fecha))}`,
    "",
    "Detalle (precios finales, IVA incluido):",
    ...items.map(
      (i: { descripcion: string; cantidad: number; precio_unitario: number; descuento: number }) =>
        `${i.cantidad} x ${i.descripcion} — unitario ${clp(i.precio_unitario)}, descuento ${clp(i.descuento)}, subtotal ${clp(i.cantidad * i.precio_unitario - i.descuento)}`
    ),
    "",
    `TOTAL: $${venta.total.toLocaleString("es-CL")}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-bold">Comprobante de compra y pagos</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarParaSII texto={textoSII} />
          {sinVoucher.length === 0 && <BotonImprimir />}
          {!venta.anulada && puedeFonasa && (
            <Link
              href={`/ventas/${venta.id}/certificado-fonasa`}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-medium text-sky-800 transition hover:bg-sky-100"
            >
              📄 Certificado Fonasa
            </Link>
          )}
          {!venta.anulada && (
            <Link
              href={`/ventas/${venta.id}`}
              className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-tinta-suave transition hover:bg-crema"
            >
              ✎ Editar
            </Link>
          )}
          {!venta.anulada && <AnularVenta ventaId={venta.id} />}
        </div>
      </div>

      <details className="rounded-xl border border-tinta-suave/20 p-3 text-sm print:hidden">
        <summary className="cursor-pointer font-semibold">Documentos para reembolso</summary>
        <p className="mt-2 text-tinta-suave">Acompaña este detalle con la boleta o voucher válido y los respaldos que correspondan. La isapre no puede exigir receta para bonificar lentes destinados al tratamiento de la presbicia.</p>
        <Link href={`/ventas/${venta.id}/reembolso`} className="mt-2 inline-block font-semibold text-brand-dark underline">Preparar reembolso y cotejar RUT</Link>
      </details>

      {sinVoucher.length > 0 && !venta.anulada && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 print:hidden">
          <h2 className="font-semibold">Completa los vouchers antes de imprimir</h2>
          <p className="text-sm">Falta el número de {sinVoucher.length} pago(s) con tarjeta. Cópialo del comprobante original de la máquina.</p>
          {sinVoucher.map((p) => <div key={p.id} className="mt-3">
            <p className="text-sm font-semibold">{fechaLegible(diaEnChile(p.fecha))} · {clp(p.monto)}</p>
            <CompletarVoucher abonoId={p.id} />
          </div>)}
        </section>
      )}

      {venta.anulada && (
        <p className="rounded-2xl bg-neutral-200 p-4 text-center text-sm font-semibold text-neutral-700 print:hidden">
          Esta venta está ANULADA{venta.anulada_motivo ? ` — ${venta.anulada_motivo}` : ""}.
        </p>
      )}

      {sinVoucher.length > 0 && !venta.anulada && <p className="hidden print:block">Comprobante pendiente: completa los números de voucher de los pagos con tarjeta antes de imprimir.</p>}
      <div className={`relative rounded-2xl bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none ${sinVoucher.length > 0 && !venta.anulada ? "print:hidden" : ""}`}>
        {venta.anulada && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black text-neutral-300/60 select-none">
            ANULADA
          </p>
        )}
        <div className="mb-4 flex items-center gap-3 border-b border-neutral-300 pb-3">
          {optica?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optica.logo_url} alt="" className="h-12 w-12 object-contain" />
          )}
          <div>
            <h2 className="text-lg font-bold">{optica?.nombre_comercial}</h2>
            {optica?.razon_social && <p className="text-sm">{optica.razon_social}</p>}
            {optica?.rut_empresa && <p className="text-sm">RUT: {formatearRut(optica.rut_empresa)}</p>}
            {(optica?.direccion || optica?.telefono) && (
              <p className="text-sm">
                {[optica.direccion, formatearTelefono(optica.telefono)].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <div className="mb-4 border-b border-neutral-300 pb-3">
          <p className="text-sm">
            Comprobante de compra y pagos · {fechaLegible(diaEnChile(venta.fecha))}{" "}
            {new Date(venta.fecha).toLocaleTimeString("es-CL", {
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "America/Santiago",
            })}
          </p>
          {paciente && (
            <p className="text-sm">
              Cliente: {paciente.nombre}
              {paciente.rut ? ` · ${formatearRut(paciente.rut)}` : ""}
            </p>
          )}
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-xs text-neutral-500">
              <th className="py-1.5">Detalle</th>
              <th className="py-1.5 text-center">Cant.</th>
              <th className="py-1.5 text-right">Precio</th>
              <th className="py-1.5 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i: number) => {
              const rel = item.ordenes_trabajo;
              const ot = Array.isArray(rel) ? rel[0] : rel;
              const detalleCristal = item.cristal_slot != null && ot
                ? (item.cristal_slot === 2
                  ? [ot.tipo_lente_2, ot.posicion_2, ot.tratamiento_2]
                  : [ot.tipo_lente, ot.posicion, ot.tratamiento]).filter(Boolean).join(" · ")
                : "";
              return (
              <tr key={i} className="border-b border-neutral-100">
                <td className="py-1.5 pr-2">{item.descripcion}
                  {detalleCristal && <span className="block text-xs text-neutral-600">{detalleCristal}</span>}
                  {item.descuento > 0 && <span className="block text-xs text-neutral-600">Descuento: {clp(item.descuento)}</span>}
                </td>
                <td className="py-1.5 text-center">{item.cantidad}</td>
                <td className="py-1.5 text-right">{clp(item.precio_unitario)}</td>
                <td className="py-1.5 text-right">
                  {clp(item.cantidad * item.precio_unitario - item.descuento)}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right font-bold">Total</td>
              <td className="py-2 text-right text-base font-bold">{clp(venta.total)}</td>
            </tr>
          </tfoot>
        </table>

        {pagos.length === 0 && <p className="mt-3 text-sm">Sin abonos registrados. Saldo pendiente: {clp(venta.total)}.</p>}

        {pagos.length > 0 && (
          <div className="mt-3 border-t border-neutral-200 pt-3 text-sm">
            <p className="mb-1 text-xs font-semibold text-neutral-500">Pagos</p>
            {pagos.map((p: { monto: number; medio_pago: string; fecha: string; numero_voucher: string | null }, i: number) => (
              <p key={i} className="flex justify-between">
                <span className="capitalize">
                  {fechaLegible(diaEnChile(p.fecha))} · {p.medio_pago}
                  {p.numero_voucher && <span className="block text-xs normal-case">Operación / voucher: {p.numero_voucher}</span>}
                </span>
                <span>{clp(p.monto)}</span>
              </p>
            ))}
            <p className="mt-2 flex justify-between"><span>Total abonado</span><span>{clp(abonado)}</span></p>
            <p className="mt-2 flex justify-between font-bold">
              <span>{saldo > 0 ? "Saldo pendiente" : "Pagado"}</span>
              <span>{saldo > 0 ? clp(saldo) : "✓"}</span>
            </p>
          </div>
        )}

        {folios.length > 0 && (
          <div className="mt-4 rounded-lg border border-neutral-300 p-3 text-center text-sm font-semibold print:mt-5">
            Orden de trabajo N° {folios.map((f) => `${f}`).join(", ")} — presente este
            comprobante al momento de retirar su trabajo.
          </div>
        )}

      </div>
    </div>
  );
}
