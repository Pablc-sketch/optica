import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BotonImprimir from "@/components/boton-imprimir";
import {
  ZONA_CHILE,
  diaEnChile,
  fechaLegible,
  finDelDia,
  hoyEnChile,
  inicioDelDia,
  restarDias,
} from "@/lib/fechas";

// Hoja de pedido de cristales (como la hoja LABORATORIO del SGO Excel).
// Neutra y sin logo: sirve para pedir a cualquier proveedor.
//
// El flujo real: los cristales "de stock" y los "de laboratorio" van al
// mismo distribuidor pero en cajas separadas (una la resuelve con
// existencias propias del distribuidor, la otra la manda a fabricar) — así
// que cada origen necesita su propia hoja para imprimir y meter en su caja,
// no una hoja mezclada.
//
// Por default se muestra lo pendiente (todavía no volvió del distribuidor,
// es decir sigue en "recepción" o "laboratorio"): apenas se registra una
// venta aparece acá solo, y al avanzar la OT a "montaje" desaparece sola,
// sin que nadie tenga que acordarse de un rango de fechas. El filtro por
// fecha queda como pestaña aparte para reimprimir algo puntual o revisar
// un período ya cerrado.

const ORIGENES = [
  { valor: "laboratorio" as const, etiqueta: "Laboratorio", titulo: "Pedido de laboratorio" },
  { valor: "stock" as const, etiqueta: "Stock", titulo: "Pedido de stock" },
];

const ESTADOS_PENDIENTES = ["recepcion", "laboratorio"];

function fmtOjo(esf: number | null, cil: number | null, eje: number | null): string {
  if (esf === null && cil === null) return "—";
  const partes: string[] = [];
  if (esf !== null) partes.push(`Esf ${esf > 0 ? "+" : ""}${Number(esf).toFixed(2)}`);
  if (cil !== null) partes.push(`Cil ${cil > 0 ? "+" : ""}${Number(cil).toFixed(2)}`);
  if (eje !== null) partes.push(`Eje ${eje}°`);
  return partes.join(" ");
}

export default async function LaboratorioPage({
  searchParams,
}: {
  searchParams: Promise<{ origen?: string; modo?: string; desde?: string; hasta?: string }>;
}) {
  const params = await searchParams;
  const origen = params.origen === "stock" ? "stock" : "laboratorio";
  const modoFecha = params.modo === "fecha";

  const hasta = params.hasta || hoyEnChile();
  const desde = params.desde || restarDias(hasta, 7);

  const supabase = await createClient();

  let query = supabase
    .from("ordenes_trabajo")
    .select(
      `folio, fecha_ingreso, tipo_lente, rango_receta, tratamiento, tipo_lente_2, tratamiento_2,
       pacientes:paciente_id (nombre),
       recetas:receta_id (od_esfera, od_cilindro, od_eje, od_add, oi_esfera, oi_cilindro, oi_eje, oi_add, dp, altura),
       productos:armazon_producto_id (sku, nombre, marca, color),
       productos_2:armazon_producto_id_2 (sku, nombre, marca, color)`
    )
    .eq("origen_cristal", origen);

  query = modoFecha
    ? // Los límites llevan el desfase de Chile. Sin él, Postgres interpreta
      // la hora como UTC y deja fuera las órdenes de la tarde.
      query.gte("fecha_ingreso", inicioDelDia(desde)).lte("fecha_ingreso", finDelDia(hasta))
    : query.in("estado", ESTADOS_PENDIENTES);

  const [otsRes, tenantRes, ultimaRes] = await Promise.all([
    query.order("folio", { ascending: true }),
    supabase.from("tenants").select("nombre_comercial").single(),
    // Para poder decir "hay órdenes, pero fuera de este período" en vez de
    // dejar la hoja vacía sin explicación (solo aplica en modo fecha).
    modoFecha
      ? supabase
          .from("ordenes_trabajo")
          .select("fecha_ingreso")
          .eq("origen_cristal", origen)
          .order("fecha_ingreso", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const ots = otsRes.data ?? [];
  const nombreOptica = tenantRes.data?.nombre_comercial ?? "";
  const tituloOrigen = ORIGENES.find((o) => o.valor === origen)!;

  const ultimaFecha = ultimaRes.data?.fecha_ingreso ? diaEnChile(ultimaRes.data.fecha_ingreso) : null;
  const hayFueraDelPeriodo = modoFecha && ots.length === 0 && ultimaFecha !== null;

  const conParam = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ origen, ...(modoFecha ? { modo: "fecha", desde, hasta } : {}), ...extra });
    return `/laboratorio?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold">Pedido de cristales</h1>
        <BotonImprimir />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        {ORIGENES.map((o) => (
          <Link
            key={o.valor}
            href={conParam({ origen: o.valor })}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              origen === o.valor ? "bg-brand text-white" : "bg-crema-claro text-tinta-suave hover:bg-white"
            }`}
          >
            {o.etiqueta}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 print:hidden">
        <Link
          href={conParam({ modo: "pendientes" })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            !modoFecha ? "bg-brand/15 text-brand-dark" : "bg-crema-claro text-tinta-suave hover:bg-white"
          }`}
        >
          Pendientes
        </Link>
        <Link
          href={conParam({ modo: "fecha" })}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
            modoFecha ? "bg-brand/15 text-brand-dark" : "bg-crema-claro text-tinta-suave hover:bg-white"
          }`}
        >
          Por fecha
        </Link>

        {modoFecha && (
          <>
            <form className="flex flex-wrap items-center gap-2" action="/laboratorio">
              <input type="hidden" name="origen" value={origen} />
              <input type="hidden" name="modo" value="fecha" />
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
            {[
              { dias: 7, texto: "Últimos 7 días" },
              { dias: 30, texto: "Últimos 30 días" },
              { dias: 365, texto: "Último año" },
            ].map((r) => (
              <Link
                key={r.dias}
                href={conParam({ modo: "fecha", desde: restarDias(hoyEnChile(), r.dias), hasta: hoyEnChile() })}
                className="rounded-full bg-crema-claro px-3 py-1.5 text-xs font-medium text-tinta-suave transition hover:bg-brand hover:text-white"
              >
                {r.texto}
              </Link>
            ))}
          </>
        )}
      </div>

      {hayFueraDelPeriodo && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
          No hay órdenes de {tituloOrigen.etiqueta.toLowerCase()} en el período elegido ({fechaLegible(desde)}{" "}
          al {fechaLegible(hasta)}), pero sí las hay fuera de él: la más reciente es del{" "}
          <b>{fechaLegible(ultimaFecha!)}</b>.{" "}
          <Link href={conParam({ modo: "fecha", desde: ultimaFecha!, hasta: hoyEnChile() })} className="font-semibold underline">
            Ver desde esa fecha
          </Link>
        </div>
      )}

      {/* Hoja imprimible: texto plano, sin logo ni colores de marca */}
      <div className="rounded-2xl bg-white p-5 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-4 border-b border-neutral-300 pb-3 text-neutral-900">
          <h2 className="text-lg font-bold uppercase tracking-wide">{tituloOrigen.titulo}</h2>
          <p className="text-sm">
            Solicitante: {nombreOptica} ·{" "}
            {modoFecha ? (
              <>Período: {fechaLegible(desde)} al {fechaLegible(hasta)} · </>
            ) : (
              "Pendientes de recibir · "
            )}
            Emitido: {new Date().toLocaleDateString("es-CL", { timeZone: ZONA_CHILE })}
          </p>
        </div>

        {ots.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {modoFecha
              ? `No hay órdenes de ${tituloOrigen.etiqueta.toLowerCase()} en este período.`
              : `No hay cristales de ${tituloOrigen.etiqueta.toLowerCase()} pendientes de recibir.`}
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
                {ots.flatMap((ot) => {
                  const r = ot.recetas as unknown as {
                    od_esfera: number | null; od_cilindro: number | null; od_eje: number | null; od_add: number | null;
                    oi_esfera: number | null; oi_cilindro: number | null; oi_eje: number | null; oi_add: number | null;
                    dp: number | null; altura: number | null;
                  } | null;
                  const marco = ot.productos as unknown as { sku: string | null; nombre: string; marca: string | null; color: string | null } | null;
                  const marco2 = ot.productos_2 as unknown as { sku: string | null; nombre: string; marca: string | null; color: string | null } | null;
                  const add = r?.od_add ?? r?.oi_add ?? null;
                  const odOi = (
                    <>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtOjo(r?.od_esfera ?? null, r?.od_cilindro ?? null, r?.od_eje ?? null)}</td>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{fmtOjo(r?.oi_esfera ?? null, r?.oi_cilindro ?? null, r?.oi_eje ?? null)}</td>
                      <td className="py-1.5 pr-2">{add !== null ? `+${Number(add).toFixed(2)}` : "—"}</td>
                      <td className="py-1.5 pr-2">{r?.dp ?? "—"}</td>
                      <td className="py-1.5 pr-2">{r?.altura ?? "—"}</td>
                    </>
                  );
                  const nombrePaciente = (ot.pacientes as unknown as { nombre: string } | null)?.nombre ?? "—";
                  const fmtMarco = (m: typeof marco) => (m ? `${m.sku ?? ""} ${m.color ?? ""}`.trim() || m.nombre : "—");
                  const tieneSegundo = Boolean(ot.tipo_lente_2 || ot.tratamiento_2);
                  const filas = [
                    <tr key={`${ot.folio}-1`} className="border-b border-neutral-200 align-top">
                      <td className="py-1.5 pr-2 font-bold">#{ot.folio}</td>
                      <td className="py-1.5 pr-2">{nombrePaciente}</td>
                      {odOi}
                      <td className="py-1.5 pr-2">{fmtMarco(marco)}</td>
                      {/* Solo el tipo de lente: el rango de receta es una
                          clasificación interna de costo, el laboratorio no
                          la usa ni la necesita para fabricar. */}
                      <td className="py-1.5 pr-2">{ot.tipo_lente}</td>
                      <td className="py-1.5">{ot.tratamiento ?? "—"}</td>
                    </tr>,
                  ];
                  if (tieneSegundo) {
                    filas.push(
                      <tr key={`${ot.folio}-2`} className="border-b-2 border-neutral-300 align-top bg-neutral-50">
                        <td className="py-1.5 pr-2 font-bold text-neutral-400">↳ #{ot.folio}</td>
                        <td className="py-1.5 pr-2 text-neutral-500">{nombrePaciente} (2° par, mismo pedido)</td>
                        {odOi}
                        <td className="py-1.5 pr-2">{fmtMarco(marco2)}</td>
                        <td className="py-1.5 pr-2">{ot.tipo_lente_2}</td>
                        <td className="py-1.5">{ot.tratamiento_2 ?? "—"}</td>
                      </tr>
                    );
                  }
                  return filas;
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
