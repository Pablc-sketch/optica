import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BotonImprimir from "@/components/boton-imprimir";
import EliminarOT from "../eliminar-ot";
import { actualizarOT } from "@/lib/actions/ot";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { diaEnChile, fechaLegible } from "@/lib/fechas";

// Detalle imprimible de la orden de trabajo: receta completa, paciente
// con RUT, tipo de lente, cristal/tratamiento, altura, DP y código del
// marco. Es el documento que acompaña el trabajo dentro de la óptica.

const ESTADOS: Record<string, string> = {
  recepcion: "Recepción",
  laboratorio: "Laboratorio",
  montaje: "Montaje",
  listo: "Listo",
  entregado: "Entregado",
};

function fmtD(v: number | null): string {
  if (v === null) return "—";
  return (v > 0 ? "+" : "") + Number(v).toFixed(2);
}

export default async function DetalleOT({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [otRes, tenantRes, responsableRes, armazonesRes, laboratoriosRes] = await Promise.all([
    supabase
      .from("ordenes_trabajo")
      .select(
        `id, folio, estado, tipo_lente, rango_receta, tratamiento, origen_cristal, proveedor_lab_id,
         armazon_producto_id, fecha_ingreso, fecha_entrega_estimada, fecha_entrega_real, notas,
         pacientes:paciente_id (nombre, rut, telefono, diabetes, hipertension, glaucoma, cirugia_ocular, alergias),
         recetas:receta_id (fecha, tipo, od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add, av_od, av_oi, dp, altura, notas),
         productos:armazon_producto_id (sku, nombre, marca, color)`
      )
      .eq("id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, telefono, direccion, logo_url").single(),
    // Quién firma como "responsable óptica" al entregar: el profesional a
    // cargo de la óptica (administrador con título cargado), no quien
    // vendió al mesón — la vendedora puede cambiar, el responsable no.
    supabase
      .from("users")
      .select("nombre, titulo_profesional, registro_profesional")
      .eq("rol", "admin")
      .order("titulo_profesional", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("productos").select("id, nombre, marca, color, sku").eq("categoria", "armazon").order("marca"),
    supabase.from("proveedores").select("id, nombre").eq("tipo", "laboratorio").order("nombre"),
  ]);

  const ot = otRes.data;
  if (!ot) notFound();

  const responsable = responsableRes.data;

  const paciente = ot.pacientes as unknown as {
    nombre: string; rut: string | null; telefono: string | null;
    diabetes: boolean; hipertension: boolean; glaucoma: boolean;
    cirugia_ocular: boolean; alergias: string | null;
  } | null;
  const antecedentes = [
    paciente?.diabetes && "Diabetes",
    paciente?.hipertension && "Hipertensión",
    paciente?.glaucoma && "Glaucoma",
    paciente?.cirugia_ocular && "Cirugía ocular previa",
    paciente?.alergias && `Alergias: ${paciente.alergias}`,
  ].filter(Boolean) as string[];
  const receta = ot.recetas as unknown as {
    fecha: string; tipo: string;
    od_esfera: number | null; od_cilindro: number | null; od_eje: number | null; od_add: number | null;
    oi_esfera: number | null; oi_cilindro: number | null; oi_eje: number | null; oi_add: number | null;
    av_od: string | null; av_oi: string | null; dp: number | null; altura: number | null; notas: string | null;
  } | null;
  const marco = ot.productos as unknown as { sku: string | null; nombre: string; marca: string | null; color: string | null } | null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold">Orden de trabajo #{ot.folio}</h1>
        <div className="flex items-center gap-2">
          <BotonImprimir />
          <EliminarOT otId={ot.id} folio={ot.folio} irALista />
        </div>
      </div>

      <details className="rounded-2xl bg-crema-claro p-4 shadow-sm print:hidden">
        <summary className="cursor-pointer font-semibold text-brand-dark">
          ✎ Corregir marco, laboratorio o entrega
        </summary>
        <p className="mt-2 text-xs text-tinta-suave">
          El tipo de lente y el tratamiento no se editan acá porque están ligados al precio ya
          cobrado — para eso anula y rehace la venta, o ajusta el monto en &quot;Editar&quot; dentro de la venta.
        </p>
        <form action={actualizarOT} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="ot_id" value={ot.id} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Marco
            <select
              name="armazon_producto_id"
              defaultValue={ot.armazon_producto_id ?? ""}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
            >
              <option value="">— Sin marco —</option>
              {(armazonesRes.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.sku && `[${p.sku}]`, p.marca, p.nombre, p.color].filter(Boolean).join(" ")}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2 text-sm">
            {(["laboratorio", "stock"] as const).map((op) => (
              <label
                key={op}
                className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-tinta-suave/25 bg-white px-2 py-2.5 has-checked:border-brand has-checked:bg-brand/10"
              >
                <input
                  type="radio"
                  name="origen_cristal"
                  value={op}
                  defaultChecked={ot.origen_cristal === op}
                  className="accent-brand"
                />
                {op === "laboratorio" ? "Pedido al laboratorio" : "De stock"}
              </label>
            ))}
          </div>
          {/* Con un solo laboratorio cargado no hay nada que elegir — mostrar
              el desplegable solo confundía ("Sin especificar" aunque solo
              hubiera una opción posible). Con dos o más sí tiene sentido. */}
          {(laboratoriosRes.data?.length ?? 0) > 1 && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Laboratorio
              <select
                name="proveedor_lab_id"
                defaultValue={ot.proveedor_lab_id ?? ""}
                className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
              >
                <option value="">— Sin especificar —</option>
                {(laboratoriosRes.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          {laboratoriosRes.data?.length === 1 && (
            <input type="hidden" name="proveedor_lab_id" value={laboratoriosRes.data[0].id} />
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha de entrega estimada
            <input
              type="date"
              name="fecha_entrega_estimada"
              defaultValue={ot.fecha_entrega_estimada ?? ""}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Notas
            <textarea
              name="notas"
              rows={2}
              defaultValue={ot.notas ?? ""}
              className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand"
            />
          </label>
          <div>
            <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
              Guardar cambios
            </button>
          </div>
        </form>
      </details>

      <div className="rounded-2xl bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 flex items-start justify-between border-b border-neutral-300 pb-3">
          <div className="flex items-center gap-3">
            {tenantRes.data?.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenantRes.data.logo_url} alt="" className="h-12 w-12 object-contain" />
            )}
            <div>
              <h2 className="text-lg font-bold">ORDEN DE TRABAJO #{ot.folio}</h2>
              <p className="text-sm">{tenantRes.data?.nombre_comercial}</p>
              {(tenantRes.data?.direccion || tenantRes.data?.telefono) && (
                <p className="text-xs">
                  {[tenantRes.data.direccion, formatearTelefono(tenantRes.data.telefono)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold">{ESTADOS[ot.estado] ?? ot.estado}</p>
            <p>Ingreso: {fechaLegible(diaEnChile(ot.fecha_ingreso))}</p>
            {ot.fecha_entrega_estimada && (
              <p>Entrega est.: {new Date(ot.fecha_entrega_estimada + "T00:00:00").toLocaleDateString("es-CL")}</p>
            )}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Paciente:</span> {paciente?.nombre ?? "—"}</p>
          <p><span className="font-semibold">RUT:</span> {formatearRut(paciente?.rut) || "—"}</p>
          <p><span className="font-semibold">Teléfono:</span> {formatearTelefono(paciente?.telefono) || "—"}</p>
          {receta && (
            <p><span className="font-semibold">Fecha receta:</span> {new Date(receta.fecha + "T00:00:00").toLocaleDateString("es-CL")}</p>
          )}
        </div>

        {antecedentes.length > 0 && (
          <p className="mb-4 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
            <span className="font-semibold">Antecedentes:</span> {antecedentes.join(" · ")}
          </p>
        )}

        {receta ? (
          <table className="mb-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-neutral-400 text-left text-xs">
                <th className="py-1.5 pr-2"></th>
                <th className="py-1.5 pr-2">Esfera</th>
                <th className="py-1.5 pr-2">Cilindro</th>
                <th className="py-1.5 pr-2">Eje</th>
                <th className="py-1.5 pr-2">ADD</th>
                <th className="py-1.5">AV</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pr-2 font-bold">OD</td>
                <td className="py-1.5 pr-2">{fmtD(receta.od_esfera)}</td>
                <td className="py-1.5 pr-2">{fmtD(receta.od_cilindro)}</td>
                <td className="py-1.5 pr-2">{receta.od_eje !== null ? `${receta.od_eje}°` : "—"}</td>
                <td className="py-1.5 pr-2">{fmtD(receta.od_add)}</td>
                <td className="py-1.5">{receta.av_od ?? "—"}</td>
              </tr>
              <tr className="border-b border-neutral-200">
                <td className="py-1.5 pr-2 font-bold">OI</td>
                <td className="py-1.5 pr-2">{fmtD(receta.oi_esfera)}</td>
                <td className="py-1.5 pr-2">{fmtD(receta.oi_cilindro)}</td>
                <td className="py-1.5 pr-2">{receta.oi_eje !== null ? `${receta.oi_eje}°` : "—"}</td>
                <td className="py-1.5 pr-2">{fmtD(receta.oi_add)}</td>
                <td className="py-1.5">{receta.av_oi ?? "—"}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="mb-4 text-sm text-neutral-500">Sin receta asociada.</p>
        )}

        <div className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3">
          <p><span className="font-semibold">DP:</span> {receta?.dp ?? "—"} mm</p>
          <p><span className="font-semibold">Altura:</span> {receta?.altura ?? "—"} mm</p>
          <p><span className="font-semibold">Tipo:</span> {ot.tipo_lente ?? "—"}</p>
          {/* Rango de receta y origen (stock/laboratorio) son datos de
              trabajo interno, no algo que el cliente necesite ver en su
              copia; el laboratorio los sigue recibiendo en /laboratorio. */}
          <p className="col-span-2"><span className="font-semibold">Cristal / Tratamiento:</span> {ot.tratamiento ?? "—"}</p>
          <p className="col-span-2">
            <span className="font-semibold">Marco:</span>{" "}
            {marco ? `${marco.sku ? `[${marco.sku}] ` : ""}${marco.marca ?? ""} ${marco.nombre} ${marco.color ?? ""}`.trim() : "—"}
          </p>
        </div>

        {(ot.notas || receta?.notas) && (
          <p className="mt-4 border-t border-neutral-200 pt-3 text-sm">
            <span className="font-semibold">Notas:</span> {[ot.notas, receta?.notas].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="mt-10 grid grid-cols-2 gap-6 print:mt-16">
          <div className="flex h-28 flex-col justify-end rounded border border-neutral-300 p-2 text-center text-xs text-neutral-500">
            <p className="border-t border-neutral-300 pt-1">Recibí conforme — firma del paciente</p>
          </div>
          <div className="flex h-28 flex-col justify-end rounded border border-neutral-300 p-2 text-center text-xs text-neutral-500">
            <p className="border-t border-neutral-300 pt-1">
              <span className="font-semibold text-neutral-700">{responsable?.nombre ?? "Responsable óptica"}</span>
              {responsable?.titulo_profesional && (
                <>
                  <br />
                  {responsable.titulo_profesional}
                </>
              )}
              <br />
              Responsable óptica
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
