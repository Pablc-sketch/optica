import Link from "next/link";
import { exigirRolPagina } from "@/lib/autorizacion";
import { cargarPendientes } from "@/lib/resumen-pendientes";
import { clp } from "@/lib/clp";
import { fechaLegible } from "@/lib/fechas";

const VISTAS = [{ clave: "sueldos", titulo: "Sueldos" }, { clave: "costos", titulo: "Costos" }, { clave: "ahorro", titulo: "Ahorro" }] as const;
export default async function Pagos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase } = await exigirRolPagina(["admin"]);
  const { ver } = await searchParams;
  const vista = VISTAS.find((v) => v.clave === ver) ?? VISTAS[0];
  const { resumen, error, sinAsignar } = await cargarPendientes(supabase);
  const filas = resumen.operativos.filter((o) => o[vista.clave] > 0);
  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <h1 className="text-2xl font-bold">Pagos y ahorro</h1>
    <nav className="flex gap-2" aria-label="Tipo de pendiente">
      {VISTAS.map((v) => <Link key={v.clave} href={`/pagos?ver=${v.clave}`} aria-current={vista.clave === v.clave ? "page" : undefined}
        className={`rounded-xl px-4 py-3 font-semibold ${vista.clave === v.clave ? "bg-tinta text-white" : "bg-white"}`}>{v.titulo}</Link>)}
    </nav>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-800">No se pudieron leer los pendientes. Recarga.</p> : <>
      <p className="text-3xl font-bold tabular-nums">{clp(resumen[vista.clave])}</p>
      {sinAsignar && <Link href="/reportes" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Hay retiros sin operativo. Revísalos antes de volver a pagar →</Link>}
      {vista.clave === "costos" && <p className="text-sm text-tinta-suave">Sin pago registrado. Revisa el historial antes de registrar un pago antiguo.</p>}
      {filas.length === 0 && <p className="rounded-xl bg-emerald-50 p-4">Sin pendientes</p>}
      {filas.map((o) => <Link key={o.operativoId} href={`/operativos/${o.operativoId}/cierre#${vista.clave}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <span><b className="block">{o.nombre}</b><span className="text-sm text-tinta-suave">{fechaLegible(o.fecha)}</span></span>
        <b className="tabular-nums">{clp(o[vista.clave])} →</b>
      </Link>)}
    </>}
  </div>;
}
