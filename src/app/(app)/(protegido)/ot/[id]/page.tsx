import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BotonImprimir from "@/components/boton-imprimir";
import EliminarOT from "../eliminar-ot";
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

  const [otRes, tenantRes, ventaRes] = await Promise.all([
    supabase
      .from("ordenes_trabajo")
      .select(
        `id, folio, estado, tipo_lente, rango_receta, tratamiento, origen_cristal,
         fecha_ingreso, fecha_entrega_estimada, fecha_entrega_real, notas,
         pacientes:paciente_id (nombre, rut, telefono, diabetes, hipertension, glaucoma, cirugia_ocular, alergias),
         recetas:receta_id (fecha, tipo, od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add, av_od, av_oi, dp, altura, notas),
         productos:armazon_producto_id (sku, nombre, marca, color)`
      )
      .eq("id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, telefono, direccion, logo_url").single(),
    // Quién vendió: el que firma como "responsable óptica" al entregar, no
    // el profesional clínico que tomó la receta (ese timbre va en la receta,
    // no en la orden de trabajo).
    supabase
      .from("venta_items")
      .select("ventas:venta_id (users:vendedor_id (nombre))")
      .eq("ot_id", id)
      .limit(1)
      .maybeSingle(),
  ]);

  const ot = otRes.data;
  if (!ot) notFound();

  const venta = ventaRes.data?.ventas as unknown as { users: { nombre: string } | { nombre: string }[] | null } | { users: { nombre: string } | { nombre: string }[] | null }[] | null;
  const ventaUno = Array.isArray(venta) ? (venta[0] ?? null) : venta;
  const vendedorRel = ventaUno?.users;
  const vendedorNombre = (Array.isArray(vendedorRel) ? vendedorRel[0]?.nombre : vendedorRel?.nombre) ?? null;

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

        <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs text-neutral-500 print:mt-16">
          <p className="border-t border-neutral-300 pt-1">Recibí conforme (cliente)</p>
          <p className="border-t border-neutral-300 pt-1">
            Responsable óptica
            {vendedorNombre && (
              <>
                <br />
                {vendedorNombre}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
