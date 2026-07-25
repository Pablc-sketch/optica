import { createClient } from "@/lib/supabase/server";
import BotonImprimir from "@/components/boton-imprimir";

// Hoja de pedido de cristales al laboratorio (como la hoja LABORATORIO
// del SGO Excel). Neutra y sin logo: sirve para pedir a cualquier
// laboratorio. Filtrable por fecha de ingreso de la OT.

function fmtOjo(esf: number | null, cil: number | null, eje: number | null): string {
  if (esf === null && cil === null) return "—";
  const partes: string[] = [];
  if (esf !== null) partes.push(`Esf ${esf > 0 ? "+" : ""}${Number(esf).toFixed(2)}`);
  if (cil !== null) partes.push(`Cil ${cil > 0 ? "+" : ""}${Number(cil).toFixed(2)}`);
  if (eje !== null) partes.push(`Eje ${eje}°`);
  return partes.join(" ");
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function LaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const hasta = params.hasta || hoyISO();
  const desde =
    params.desde ||
    new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const supabase = await createClient();

  const [otsRes, tenantRes] = await Promise.all([
    supabase
      .from("ordenes_trabajo")
      .select(
        `folio, fecha_ingreso, tipo_lente, rango_receta, tratamiento,
         pacientes:paciente_id (nombre),
         recetas:receta_id (od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add, dp, altura),
         productos:armazon_producto_id (sku, nombre, marca, color)`
      )
      .eq("origen_cristal", "laboratorio")
      .gte("fecha_ingreso", `${desde}T00:00:00`)
      .lte("fecha_ingreso", `${hasta}T23:59:59`)
      .order("folio", { ascending: true }),
    supabase.from("tenants").select("nombre_comercial").single(),
  ]);

  const ots = otsRes.data ?? [];
  const nombreOptica = tenantRes.data?.nombre_comercial ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold">Pedido al laboratorio</h1>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex flex-wrap items-center gap-2" action="/laboratorio">
            <label className="flex items-center gap-1 text-sm">
              Desde
              <input type="date" name="desde" defaultValue={desde} className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
            </label>
            <label className="flex items-center gap-1 text-sm">
              Hasta
              <input type="date" name="hasta" defaultValue={hasta} className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand" />
            </label>
            <button className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-semibold text-brand-dark transition hover:bg-brand hover:text-white">
              Filtrar
            </button>
          </form>
          <BotonImprimir />
        </div>
      </div>

      {/* Hoja imprimible: texto plano, sin logo ni colores de marca */}
      <div className="rounded-2xl bg-white p-5 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 border-b border-neutral-300 pb-3 text-neutral-900">
          <h2 className="text-lg font-bold uppercase tracking-wide">Pedido de cristales</h2>
          <p className="text-sm">
            Solicitante: {nombreOptica} · Período: {desde} al {hasta} · Emitido:{" "}
            {new Date().toLocaleDateString("es-CL")}
          </p>
        </div>

        {ots.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No hay órdenes con cristales de laboratorio en este período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-200 border-collapse text-xs text-neutral-900">
              <thead>
                <tr className="border-b-2 border-neutral-400 text-left">
                  <th className="py-1.5 pr-2">OT</th>
                  <th className="py-1.5 pr-2">Paciente</th>
                  <th className="py-1.5 pr-2">OD (ojo derecho)</th>
                  <th className="py-1.5 pr-2">OI (ojo izquierdo)</th>
                  <th className="py-1.5 pr-2">ADD</th>
                  <th className="py-1.5 pr-2">DP</th>
                  <th className="py-1.5 pr-2">Altura</th>
                  <th className="py-1.5 pr-2">Marco</th>
                  <th className="py-1.5 pr-2">Tipo lente</th>
                  <th className="py-1.5">Cristal / Tratamiento</th>
                </tr>
              </thead>
              <tbody>
                {ots.map((ot) => {
                  const r = ot.recetas as unknown as {
                    od_esfera: number | null; od_cilindro: number | null; od_eje: number | null; od_add: number | null;
                    oi_esfera: number | null; oi_cilindro: number | null; oi_eje: number | null; oi_add: number | null;
                    dp: number | null; altura: number | null;
                  } | null;
                  const marco = ot.productos as unknown as { sku: string | null; nombre: string; marca: string | null; color: string | null } | null;
                  const add = r?.od_add ?? r?.oi_add ?? null;
                  return (
                    <tr key={ot.folio} className="border-b border-neutral-200 align-top">
                      <td className="py-1.5 pr-2 font-bold">#{ot.folio}</td>
                      <td className="py-1.5 pr-2">{(ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—"}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtOjo(r?.od_esfera ?? null, r?.od_cilindro ?? null, r?.od_eje ?? null)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtOjo(r?.oi_esfera ?? null, r?.oi_cilindro ?? null, r?.oi_eje ?? null)}</td>
                      <td className="py-1.5 pr-2">{add !== null ? `+${Number(add).toFixed(2)}` : "—"}</td>
                      <td className="py-1.5 pr-2">{r?.dp ?? "—"}</td>
                      <td className="py-1.5 pr-2">{r?.altura ?? "—"}</td>
                      <td className="py-1.5 pr-2">
                        {marco ? `${marco.sku ?? ""} ${marco.color ?? ""}`.trim() || marco.nombre : "—"}
                      </td>
                      <td className="py-1.5 pr-2">{[ot.tipo_lente, ot.rango_receta].filter(Boolean).join(" ")}</td>
                      <td className="py-1.5">{ot.tratamiento ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs text-neutral-500 print:text-neutral-700">
          Total de órdenes: {ots.length}
        </p>
      </div>
    </div>
  );
}
