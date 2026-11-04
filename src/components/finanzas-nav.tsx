import Link from 'next/link';

const enlaces = [
  { href:'/caja', texto:'Resumen', clave:'resumen' },
  { href:'/caja?vista=movimientos', texto:'Movimientos', clave:'movimientos' },
  { href:'/pagos', texto:'Por pagar', clave:'pendientes' },
  { href:'/pagos/revisar', texto:'Revisar y corregir', clave:'revision' },
] as const;
export default function FinanzasNav({ activo, titulo = 'Finanzas', descripcion = 'Tus cuentas, gastos y pagos en un solo lugar.', nuevo = true }: {
  activo?: string; titulo?: string; descripcion?: string; nuevo?: boolean;
}) {
  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Administración</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">{titulo}</h1>
        <p className="mt-1 text-sm text-slate-600">{descripcion}</p></div>
      {nuevo && <Link href="/caja/nuevo" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"><span aria-hidden="true">＋</span> Registrar movimiento</Link>}
    </div>
    <nav aria-label="Finanzas" className="flex min-w-0 max-w-full gap-1 overflow-x-auto border-b border-slate-200 pb-px">
      {enlaces.map(e => <Link key={e.clave} href={e.href} aria-current={activo===e.clave?'page':undefined}
        className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${activo===e.clave?'border-teal-700 text-teal-900':'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>{e.texto}</Link>)}
    </nav>
  </>;
}
