import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import BotonImprimir from "@/components/boton-imprimir";
import CopiarParaSII from "@/components/copiar-para-sii";

// Comprobante de venta imprimible (uso interno / respaldo para el cliente).
// NOTA: no es boleta electrónica del SII — esa se emite vía un proveedor
// DTE certificado (OpenFactura, LibreDTE, Bsale) cuando se integre; este
// comprobante queda como respaldo imprimible mientras tanto.

export default async function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [ventaRes, tenantRes] = await Promise.all([
    supabase
      .from("ventas")
      .select(
        `id, fecha, total, estado_pago,
         pacientes:paciente_id (nombre, rut),
         venta_items (descripcion, cantidad, precio_unitario, descuento, ordenes_trabajo:ot_id (folio)),
         pagos_abonos (monto, medio_pago, fecha)`
      )
      .eq("id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, rut_empresa").single(),
  ]);

  const venta = ventaRes.data;
  if (!venta) notFound();

  const optica = tenantRes.data;
  const paciente = venta.pacientes as unknown as { nombre: string; rut: string | null } | null;
  const items = venta.venta_items ?? [];
  const pagos = venta.pagos_abonos ?? [];
  const abonado = pagos.reduce((s: number, p: { monto: number }) => s + p.monto, 0);
  const saldo = venta.total - abonado;
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
    paciente?.rut ? `RUT: ${paciente.rut}` : null,
    `Fecha: ${new Date(venta.fecha).toLocaleDateString("es-CL")}`,
    "",
    "Detalle (precios finales, IVA incluido):",
    ...items.map(
      (i: { descripcion: string; cantidad: number; precio_unitario: number }) =>
        `${i.cantidad} x ${i.descripcion} — $${i.precio_unitario.toLocaleString("es-CL")}`
    ),
    "",
    `TOTAL: $${venta.total.toLocaleString("es-CL")}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-bold">Comprobante de venta</h1>
        <div className="flex flex-wrap items-center gap-2">
          <CopiarParaSII texto={textoSII} />
          <BotonImprimir />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 border-b border-neutral-300 pb-3">
          <h2 className="text-lg font-bold">{optica?.nombre_comercial}</h2>
          {optica?.rut_empresa && <p className="text-sm">RUT: {optica.rut_empresa}</p>}
          <p className="mt-1 text-sm">
            Comprobante de venta · {new Date(venta.fecha).toLocaleDateString("es-CL")}{" "}
            {new Date(venta.fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {paciente && (
            <p className="text-sm">
              Cliente: {paciente.nombre}
              {paciente.rut ? ` · ${paciente.rut}` : ""}
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
            {items.map((item: { descripcion: string; cantidad: number; precio_unitario: number; descuento: number }, i: number) => (
              <tr key={i} className="border-b border-neutral-100">
                <td className="py-1.5 pr-2">{item.descripcion}</td>
                <td className="py-1.5 text-center">{item.cantidad}</td>
                <td className="py-1.5 text-right">{clp(item.precio_unitario)}</td>
                <td className="py-1.5 text-right">
                  {clp(item.cantidad * item.precio_unitario - item.descuento)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right font-bold">Total</td>
              <td className="py-2 text-right text-base font-bold">{clp(venta.total)}</td>
            </tr>
          </tfoot>
        </table>

        {pagos.length > 0 && (
          <div className="mt-3 border-t border-neutral-200 pt-3 text-sm">
            <p className="mb-1 text-xs font-semibold text-neutral-500">Pagos</p>
            {pagos.map((p: { monto: number; medio_pago: string; fecha: string }, i: number) => (
              <p key={i} className="flex justify-between">
                <span className="capitalize">
                  {new Date(p.fecha).toLocaleDateString("es-CL")} · {p.medio_pago}
                </span>
                <span>{clp(p.monto)}</span>
              </p>
            ))}
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

        <p className="mt-5 text-center text-xs text-neutral-400">
          Documento interno de respaldo — no constituye boleta electrónica del SII.
        </p>
      </div>
    </div>
  );
}
