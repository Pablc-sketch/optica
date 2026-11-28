import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarRepartoOperativo } from "@/lib/datos-caja-chequeo";
import { hoyEnChile } from "@/lib/fechas";
import ResumenReparto from "@/components/resumen-reparto";
import PagoCostoOperativo from "@/components/pago-costo-operativo";
import CostoFidesEditor from "@/components/costo-fides-editor";

// Cerrar el operativo: cuánto se ganó de verdad y a quién hay que pagarle.
// Cada "Marcar pagado" saca esa plata de la caja, así la cuenta de la app
// muestra lo mismo que la cuenta real después de repartir.
export default async function CierreOperativo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string }> }) {
  const { id } = await params;
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const anterior = await supabase.rpc("version_caja_reparto");
  const [reparto, consulta] = await Promise.all([
    cargarRepartoOperativo(supabase, tenantId, id, hoyEnChile()), searchParams,
  ]);
  const posterior = await supabase.rpc("version_caja_reparto");
  const version = !anterior.error && !posterior.error && anterior.data === posterior.data
    ? posterior.data as string | null : null;
  const fila = reparto?.datos.repartoOperativos.find(f => f.sede.id === id);
  if (!reparto || !fila) notFound();
  const op = fila.sede;
  const costos = reparto.datos.caja.costosPorSede.find(f => f.sede.id === id)?.costos ?? [];
  const nota = await supabase.from("operativos").select("costo_fides_nota").eq("tenant_id", tenantId).eq("id", id).maybeSingle();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link href={`/operativos/${id}`} className="text-sm text-tinta-suave underline">
          ← {op.nombre}
        </Link>
        <Link href={`/gastos?op=${id}`} className="mt-2 block rounded-xl bg-emerald-800 px-4 py-3 text-center font-semibold text-white">Gastos: saldar y vincular pagos anteriores →</Link>
        <h1 className="mt-1 text-2xl font-bold">Reparto y pagos del operativo</h1>
        <Link
          href={`/cobros?op=${id}&ver=deben`}
          className="mt-2 inline-block rounded-xl border-2 border-tinta/15 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-crema"
        >
          Quién debe →
        </Link>
      </div>

      {consulta.guardado === "1" && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm">Registro guardado.</p>}
      <ResumenReparto resumen={reparto} operativo={id} version={version} />
      <section id="costos" className="space-y-3 scroll-mt-20">
        <h2 className="text-lg font-bold">Costos y reintegros</h2>
        {op.pagos_saldados_en ? <p className="rounded-xl bg-emerald-50 p-3 text-sm">Costos del operativo saldados.</p> : <>
          {!nota.error && <CostoFidesEditor operativoId={id} actual={op.costo_fides_real ?? null} nota={nota.data?.costo_fides_nota ?? null} />}
          <ul className="flex flex-col gap-3">
            {costos.map(costo => <PagoCostoOperativo key={costo.clave} operativoId={id}
              costoFidesActual={costo.clave === "fides" ? op.costo_fides_real ?? null : undefined} {...costo} />)}
          </ul>
        </>}
      </section>
    </div>
  );
}
