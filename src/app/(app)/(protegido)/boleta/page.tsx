import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { formatearRut } from "@/lib/rut";
import { diaEnChile, fechaLegible } from "@/lib/fechas";
import { actualizarVoucherAbono } from "@/lib/actions/ventas";

// Estado de la emisión de boletas electrónicas. Hoy el flujo es manual
// asistido (copiar datos → portal del SII). Para emitir automáticamente
// hace falta un proveedor DTE certificado + certificado digital; cuando
// estén las credenciales, esta pantalla pasa a mostrar los folios emitidos.

const PASOS = [
  {
    titulo: "Inicio de actividades y giro afecto a IVA",
    detalle: "La óptica debe estar con actividades iniciadas en el SII. La venta de lentes es afecta a IVA (19% incluido en el precio).",
  },
  {
    titulo: "Inscribirse como emisor de boleta electrónica",
    detalle: "Se hace una sola vez en sii.cl con ClaveÚnica o Clave Tributaria.",
  },
  {
    titulo: "Certificado digital",
    detalle: "Es la firma electrónica de la empresa; cuesta alrededor de $12.000 al año. Sin esto ningún programa puede emitir en tu nombre.",
  },
  {
    titulo: "Cuenta en un proveedor con API",
    detalle: "SimpleAPI es gratis hasta 500 boletas al mes; OpenFactura cobra alrededor de $360.000 al año con documentos ilimitados y varias razones sociales (mejor si la óptica factura mucho).",
  },
];

const MEDIOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
};

function uno<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default async function BoletaPage() {
  const supabase = await createClient();

  const { data: ventas } = await supabase
    .from("ventas")
    .select(
      `id, fecha, total,
       pacientes:paciente_id (nombre, rut),
       venta_items (descripcion, cantidad, precio_unitario, cristal_slot, productos:producto_id (categoria)),
       pagos_abonos (id, monto, medio_pago, fecha, numero_voucher)`
    )
    .eq("anulada", false)
    .order("fecha", { ascending: false })
    .limit(30);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Boleta</h1>
        <p className="text-sm text-tinta-suave">
          Comprobante detallado de cada venta — cristal, marco, abonos con fecha y el número de
          voucher de la máquina, para cuando alguien pida boleta detallada para su reembolso.
        </p>
      </div>

      <section>
        {!ventas || ventas.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin ventas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ventas.map((v) => {
              const p = v.pacientes as unknown as { nombre: string; rut: string | null } | null;
              const items = v.venta_items ?? [];
              const pagos = v.pagos_abonos ?? [];
              const abonado = pagos.reduce((s, pa) => s + pa.monto, 0);
              return (
                <li key={v.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                      <span className="text-xs text-tinta-suave">{fechaLegible(diaEnChile(v.fecha))}</span>
                      <span className="flex-1 truncate text-sm font-medium">
                        {p?.nombre ?? "Sin paciente"}
                        {p?.rut ? ` · ${formatearRut(p.rut)}` : ""}
                      </span>
                      <span className="font-bold">{clp(v.total)}</span>
                    </summary>

                    <div className="mt-3 flex flex-col gap-3 border-t border-tinta-suave/15 pt-3">
                      <div>
                        <p className="text-xs font-semibold text-tinta-suave">Detalle de lo vendido</p>
                        <ul className="mt-1 flex flex-col gap-1">
                          {items.map((it, i) => {
                            const producto = uno(
                              it.productos as unknown as { categoria: string } | { categoria: string }[] | null
                            );
                            const esArmazon = producto?.categoria === "armazon";
                            const esCristal = it.cristal_slot !== null;
                            return (
                              <li key={i} className="flex items-center gap-2 text-sm">
                                <span className="flex-1 truncate">
                                  {it.descripcion}
                                  {esCristal && (
                                    <span className="ml-1.5 rounded-full bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-dark">
                                      Cristal
                                    </span>
                                  )}
                                  {esArmazon && (
                                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                      Marco
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold">{clp(it.cantidad * it.precio_unitario)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-tinta-suave">
                          Pagos ({clp(abonado)} de {clp(v.total)})
                        </p>
                        {pagos.length === 0 ? (
                          <p className="mt-1 text-sm text-tinta-suave">Sin pagos registrados todavía.</p>
                        ) : (
                          <ul className="mt-1 flex flex-col gap-1.5">
                            {pagos.map((pa) => (
                              <li
                                key={pa.id}
                                className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                              >
                                <span className="text-xs text-tinta-suave">
                                  {fechaLegible(diaEnChile(pa.fecha))}
                                </span>
                                <span className="rounded-full bg-crema px-2 py-0.5 text-xs font-medium text-tinta-suave">
                                  {MEDIOS_PAGO[pa.medio_pago] ?? pa.medio_pago}
                                </span>
                                <span className="font-semibold">{clp(pa.monto)}</span>
                                <form action={actualizarVoucherAbono} className="ml-auto flex items-center gap-1.5">
                                  <input type="hidden" name="abono_id" value={pa.id} />
                                  <label className="text-xs text-tinta-suave">N° voucher</label>
                                  <input
                                    name="numero_voucher"
                                    defaultValue={pa.numero_voucher ?? ""}
                                    placeholder="—"
                                    className="w-28 rounded-lg border border-tinta-suave/30 bg-white px-2 py-1 text-xs outline-none focus:border-brand"
                                  />
                                  <button className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium transition hover:bg-crema">
                                    ✓
                                  </button>
                                </form>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-amber-50 p-4 text-sm">
        <p className="font-semibold text-amber-900">Boleta electrónica (SII) — estado actual: emisión asistida</p>
        <p className="mt-1 text-amber-900/90">
          El portal del SII pide clave y no permite que otro sitio le pase los datos por un
          link, así que no se puede rellenar solo desde acá. En cada venta hay un botón{" "}
          <b>&ldquo;Copiar datos para la boleta&rdquo;</b> que deja el cliente, el RUT, el detalle
          y el total listos para pegar en el portal.
        </p>
        <p className="mt-2 text-amber-900/90">
          Importante para tus pacientes: la boleta debe ir <b>a nombre del paciente</b> (mismo
          nombre de la receta) para que la isapre le reembolse los lentes.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Para que la boleta salga automática</h2>
        <ol className="flex flex-col gap-2">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="flex gap-3 rounded-xl bg-crema-claro px-4 py-3 shadow-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-xs font-bold text-brand-dark">
                {i + 1}
              </span>
              <div>
                <p className="text-sm font-semibold">{paso.titulo}</p>
                <p className="text-sm text-tinta-suave">{paso.detalle}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
