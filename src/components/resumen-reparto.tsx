import Link from "next/link";
import { clp } from "@/lib/clp";
import { rutaReparto, type cargarRepartoOperativo } from "@/lib/datos-caja-chequeo";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { PERSONAS_REPARTO } from "@/lib/reparto";

export default function ResumenReparto({ resumen }: {
  resumen: Awaited<ReturnType<typeof cargarRepartoOperativo>>;
}) {
  if (!resumen) return <p role="status" className="text-sm">Reparto por verificar.</p>;
  const { chequeo, datos } = resumen;
  const nombres = { ...etiquetasReparto(datos.tenant?.reparto_etiquetas), ahorro: "Ahorro" };
  return <div className="space-y-2 rounded-xl bg-white p-3 text-sm">
    <p className="font-semibold">{chequeo.nombre} · Proyección al cobrar todo</p>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PERSONAS_REPARTO.map(persona => <div key={persona}>
        <dt>{nombres[persona]}</dt>
        <dd className="font-semibold tabular-nums">{clp(datos.caja.repartoPendiente[persona])}</dd>
      </div>)}
    </dl>
    {datos.retirosSinAsignar && <p className="text-amber-800">Hay retiros por conciliar en Reportes.</p>}
    <Link href={rutaReparto(chequeo)} className="font-semibold underline">Ver disponible hoy en Caja</Link>
  </div>;
}
