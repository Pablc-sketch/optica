import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import CajaFormulario from '@/components/caja-formulario';
import SaldoCaja from '@/components/saldo-caja';
import { registrarGastoCajaOperativo } from '@/lib/actions/caja';
import { CATEGORIAS_CAJA, type resumenSedeCaja, type SedeCaja } from '@/lib/caja-operativo';
import { clp } from '@/lib/clp';
import { fechaLegible } from '@/lib/fechas';
import type { SaldoMercadoPago } from '@/lib/mercadopago-saldo';

type Fila = ReturnType<typeof resumenSedeCaja>;
const campo = 'mt-1 w-full rounded-xl border border-tinta/25 bg-white px-3 py-2.5';

function Monto({ titulo, valor }: { titulo: string; valor: number }) {
  return <div className="flex items-baseline justify-between gap-3 py-2">
    <dt>{titulo}</dt><dd className="font-semibold tabular-nums">{clp(valor)}</dd>
  </div>;
}

export default function ResumenCajaOperativo({ sedes, seleccion, filas, error, saldo, efectivo, hoy }: {
  sedes: SedeCaja[]; seleccion: SedeCaja[]; filas: Fila[]; error: boolean;
  saldo: SaldoMercadoPago; efectivo: number | null; hoy: string;
}) {
  const ids = new Set(seleccion.map(s => s.id));
  const sumar = (campo: 'vendido' | 'cobrado' | 'porCobrar' | 'efectivo' | 'digital' | 'cristales' |
    'marcos' | 'otros' | 'gastos' | 'tarjeta' | 'comisionVenta' | 'utilidad') => filas.reduce((total, sede) => total + sede[campo], 0);
  const utilidad = sumar('utilidad');

  return <>
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-xl font-bold">Operativo en caja</h2>
        {seleccion.length > 0 && <p className="mt-1 text-sm text-tinta-suave">{seleccion.map(s => s.nombre).join(' · ')}</p>}
      </div>
      <details className="w-full rounded-xl border border-tinta/15 bg-white px-3 sm:w-auto">
        <summary className="cursor-pointer py-2.5 text-sm font-semibold">Cambiar sedes</summary>
        <form action="/caja" className="grid gap-3 pb-3">
          <input type="hidden" name="sede" value="" />
          <div className="grid max-h-64 gap-1 overflow-auto">
            {sedes.map(s => <label key={s.id} className="flex gap-2 py-1.5 text-sm">
              <input type="checkbox" name="sede" value={s.id} defaultChecked={ids.has(s.id)} />
              {s.nombre} · {fechaLegible(s.fecha)}
            </label>)}
          </div>
          <button className="rounded-lg bg-tinta px-3 py-2 text-sm font-semibold text-white">Ver sedes</button>
        </form>
      </details>
    </header>

    <div className="grid items-start gap-3 md:grid-cols-2">
      {error ? <p role="alert" className="rounded-2xl bg-amber-50 p-4 text-amber-900">No se pudieron cargar las cifras del operativo. Actualiza para reintentar.</p>
        : filas.length === 0 ? <p className="rounded-2xl bg-white p-4">Elige las sedes que quieres sumar.</p> :
      <section aria-label="Ventas y cobros" className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <h3 className="text-sm font-semibold">Cobrado hasta ahora</h3>
        <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-800 sm:text-4xl">{clp(sumar('cobrado'))}</p>
        <p className="mt-1 text-xs text-tinta-suave">Efectivo {clp(sumar('efectivo'))} · Digital {clp(sumar('digital'))}</p>
        <dl className="mt-3 divide-y divide-tinta/10 border-t border-tinta/10 text-sm">
          <Monto titulo="Vendido" valor={sumar('vendido')} />
          <Monto titulo="Por cobrar" valor={sumar('porCobrar')} />
        </dl>
      </section>}
      <SaldoCaja saldo={saldo} efectivo={efectivo} />
    </div>

    {filas.length > 0 && !error && <>
      <div className="grid items-start gap-3 md:grid-cols-2">
        <section aria-label="Costos y utilidad" className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <h3 className="text-sm font-semibold">Utilidad estimada sobre ventas</h3>
          <p className={`mt-1 text-3xl font-bold tabular-nums ${utilidad < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{clp(utilidad)}</p>
          <p className="mt-1 text-xs text-tinta-suave">Descontados costos y comisiones registrados. Antes de impuestos.</p>
          <dl className="mt-3 divide-y divide-tinta/10 border-t border-tinta/10 text-sm">
            <Monto titulo="Cristales" valor={sumar('cristales')} />
            <Monto titulo="Marcos" valor={sumar('marcos')} />
            <Monto titulo="Gastos del operativo" valor={sumar('gastos')} />
            {sumar('otros') > 0 && <Monto titulo="Otros productos" valor={sumar('otros')} />}
            <Monto titulo="Comisiones" valor={sumar('tarjeta') + sumar('comisionVenta')} />
          </dl>
        </section>
        <section className="space-y-3">
          <details className="rounded-2xl border border-tinta/15 bg-white px-4">
            <summary className="cursor-pointer py-3 font-semibold text-emerald-800">+ Registrar gasto</summary>
            <div className="pb-4">
              <CajaFormulario guardar={registrarGastoCajaOperativo} texto="Guardar gasto">
                <input type="hidden" name="id" value={randomUUID()} />
                {seleccion.map(s => <input key={s.id} type="hidden" name="sede" value={s.id} />)}
                <label className="text-sm">Sede<select name="operativo_id" defaultValue={seleccion.at(-1)?.id} className={campo}>
                  {seleccion.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select></label>
                <label className="text-sm">Categoría<select name="clave" defaultValue="" required className={campo}>
                  <option value="" disabled>Elige un gasto</option>
                  {CATEGORIAS_CAJA.map(c => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}
                </select></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Monto ($)<input name="monto" type="number" min="1" step="1" required className={campo} /></label>
                  <label className="text-sm">Fecha<input name="fecha" type="date" defaultValue={hoy} max={hoy} required className={campo} /></label>
                </div>
                <label className="text-sm">Pagaste con<select name="caja" defaultValue="" required className={campo}>
                  <option value="" disabled>Elige el origen</option>
                  <option value="digital">Mercado Pago / cuenta de la óptica</option>
                  <option value="efectivo">Efectivo de la óptica</option>
                  <option value="personal">Dinero personal</option>
                </select></label>
              </CajaFormulario>
            </div>
          </details>
          <details className="rounded-2xl border border-tinta/15 bg-white px-4">
            <summary className="cursor-pointer py-3 font-semibold">Cobros por sede</summary>
            <ul className="divide-y divide-tinta/10 pb-2">
              {filas.map(s => <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{s.nombre}</span><strong className="tabular-nums">{clp(s.cobrado)}</strong>
              </li>)}
            </ul>
          </details>
          <div className="flex flex-wrap gap-x-4 gap-y-2 px-1 text-sm font-semibold">
            <Link href="/cobros" className="underline">Cobrar venta</Link>
            <Link href="/gastos" className="underline">Ver gastos</Link>
          </div>
        </section>
      </div>
    </>}
  </>;
}
