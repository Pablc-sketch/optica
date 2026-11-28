import Link from "next/link";
import { clp } from "@/lib/clp";
import { rutaReparto, type cargarRepartoOperativo } from "@/lib/datos-caja-chequeo";
import { etiquetasReparto } from "@/lib/etiquetas-reparto";
import { sueldosRegistrables } from "@/lib/datos-reparto-disponible";
import { cierrePorConfirmar, PERSONAS_SUELDO } from "@/lib/reparto-operativos";
import { finalizarSueldosOperativo } from "@/lib/actions/reparto";
import CajaFormulario from "./caja-formulario";
import SueldosReparto from "./sueldos-reparto";

export default function ResumenReparto({ resumen, operativo, version }: {
  resumen: Awaited<ReturnType<typeof cargarRepartoOperativo>>;
  operativo: string;
  version?: string | null;
}) {
  const fila = resumen?.datos.repartoOperativos.find(f => f.sede.id === operativo);
  if (!resumen || !fila) return <p role="status" className="text-sm">Reparto por verificar.</p>;
  const { chequeo, datos } = resumen;
  const nombres = etiquetasReparto(datos.tenant?.reparto_etiquetas);
  const pendiente = cierrePorConfirmar(fila);
  const cierre = fila.sede.cierre_financiero_en && !pendiente && !datos.retirosSinAsignar;
  const limite = sueldosRegistrables(datos);
  const registro = version && !datos.retirosSinAsignar && fila.porCobrar === 0
    ? { ambito: "operativo" as const, id: operativo, version, limite } : undefined;

  return <section id="sueldos" className="scroll-mt-20 space-y-3 rounded-2xl bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-bold">Utilidad y sueldos</h2>
      {cierre && <span className="text-sm font-semibold text-emerald-800">Finalizado</span>}
      {!cierre && fila.sede.cierre_financiero_en && <span className="text-sm font-semibold text-amber-800">Cierre por revisar</span>}
    </div>
    <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {[
        [fila.porCobrar ? "Utilidad proyectada" : "Utilidad del operativo", fila.utilidad],
        ["Cobrado", fila.cobrado], ["Por cobrar", fila.porCobrar], ["Ahorro de la óptica", fila.pendiente.ahorro],
      ].map(([nombre, monto]) => <div key={nombre} className="rounded-lg bg-sky-50 p-2">
        <dt>{nombre}</dt><dd className="font-bold tabular-nums">{clp(Number(monto))}</dd>
      </div>)}
    </dl>
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Ver costos de este operativo</summary>
      <dl className="mt-2 space-y-1">
        {[
          ["Vendido", fila.vendido], ["Marcos", -fila.desglose.totalArmazones],
          ["Cristales", -fila.desglose.totalCristales], ["Otros productos", -fila.desglose.totalOtros],
          ["Gastos del operativo", -fila.gastos], ["Parte de gastos del chequeo", -fila.gastosComunes],
          ["Comisión de tarjeta", -fila.comisionTarjeta], ["Comisión de ventas", -fila.comisionVentas],
          ["Reserva de IVA", -fila.iva], ["Utilidad antes de ahorro y socios", fila.utilidad],
        ].map(([nombre, monto]) => <div key={nombre} className="flex justify-between gap-2">
          <dt>{nombre}</dt><dd className="tabular-nums">{clp(Number(monto))}</dd>
        </div>)}
      </dl>
    </details>
    <SueldosReparto nombres={nombres} pagado={fila.pagado} pendiente={fila.pendiente} registro={registro} />
    {!chequeo.independiente && <p className="text-xs text-tinta-suave">
      Incluye la parte de los gastos y pagos compartidos de {chequeo.nombre}.
    </p>}
    {datos.retirosSinAsignar && <p className="text-sm text-amber-800">
      Hay retiros sin asociar. <Link href="/reportes#retiros" className="underline">Conciliar en Reportes</Link>
    </p>}
    {version === undefined && <Link href={`/operativos/${operativo}/cierre#sueldos`} className="inline-block rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white">
      {cierre ? "Ver cierre" : "Finalizar y pagar"}
    </Link>}
    {version !== undefined && !cierre && !datos.retirosSinAsignar && <>
      {fila.porCobrar > 0 && <Link href={`/cobros?op=${operativo}&ver=deben`} className="inline-block text-sm font-semibold underline">Cobrar saldos pendientes</Link>}
      {fila.porCobrar === 0 && PERSONAS_SUELDO.some(p => fila.pendiente[p] > 0 && limite[p] === 0)
        && <p className="text-sm text-amber-800">Los cobros disponibles del chequeo todavía no cubren todos los sueldos.</p>}
      {version === null && <p className="text-sm">La caja cambió. Recarga el cierre para continuar.</p>}
      {!pendiente && version !== null && <CajaFormulario guardar={finalizarSueldosOperativo} texto="Finalizar operativo">
        <input type="hidden" name="operativo" value={operativo} />
        <input type="hidden" name="version" value={version} />
      </CajaFormulario>}
    </>}
    <Link href={rutaReparto(chequeo)} className="inline-block text-sm font-semibold underline">Ver reparto en Caja</Link>
  </section>;
}
