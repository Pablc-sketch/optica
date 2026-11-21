'use client';
import { useState } from 'react';
import { nivelesMarcoDisponibles, type RecargosMarcos } from '@/lib/niveles-marco';
import { aportePorPar, resumirSimulacion, type PerfilPrecio } from '@/lib/rentabilidad-precios';
import { clp } from '@/lib/clp';

const campo = 'mt-1 block w-full rounded-xl border bg-white p-3 tabular-nums';
const numero = (v: string, max = 999999999, decimal = false) => {
  const n = Math.min(max, Math.max(0, Number(v) || 0));
  return decimal ? n : Math.floor(n);
};

type Props = {
  titulo: string; fijosRegistrados: number;
  perfiles: PerfilPrecio[]; recargosMarcos: RecargosMarcos | null; debito: number; credito: number;
  historica: number | null; comisionVenta: number;
};

export default function SimuladorSalida({ titulo, fijosRegistrados, perfiles, recargosMarcos, debito, credito, historica, comisionVenta }: Props) {
  const [perfilId, setPerfilId] = useState(perfiles.find(p => p.nombre === 'Monofocal · Orgánico Antirreflejo')?.id ?? perfiles[0]?.id ?? '');
  const [cantidades, setCantidades] = useState({ esencial: 20, seleccion: 20, premium: 10, especial: 0 });
  const [fijos, setFijos] = useState({ registrados: fijosRegistrados, combustible: 0, peajes: 0, hospedaje: 0, comida: 0, sedes: 0, otros: 0 });
  const [marcos, setMarcos] = useState({ esencial: 6000, seleccion: 6000, premium: 6000, especial: 20000 });
  const [costos, setCostos] = useState({ estuche: 1000, vendedora: comisionVenta });
  const [medio, setMedio] = useState(historica === null ? 'debito' : 'historico');
  const [completo, setCompleto] = useState(false);
  const [objetivo, setObjetivo] = useState(500000);
  const perfil = perfiles.find(p => p.id === perfilId);
  if (!perfil) return <p role="alert" className="rounded-2xl border bg-white p-5">Falta el catálogo para simular ganancias. Revisa Precios.</p>;

  const tasa = medio === 'historico' ? (historica ?? debito) : medio === 'debito' ? debito : medio === 'credito' ? credito : 0;
  const niveles = nivelesMarcoDisponibles(recargosMarcos);
  const calculos = niveles.map(n => ({ ...n, cantidad: cantidades[n.id], ...aportePorPar(perfil, n.id, recargosMarcos, marcos[n.id], costos.estuche, costos.vendedora, tasa) }));
  const totalFijos = Object.values(fijos).reduce((s, n) => s + n, 0);
  const r = resumirSimulacion(calculos, totalFijos, objetivo);
  const sinCantidad = r.cantidad === 0;
  const porcentaje = (n: number | null) => n === null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}%`;
  const variables = calculos.reduce((s, n) => s + (perfil.costo + marcos[n.id] + costos.estuche) * n.cantidad, 0);
  const comisiones = r.ventas * (costos.vendedora + tasa) / 100;

  return <section className="space-y-4" aria-label="Simulador de ganancias">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h2 className="text-xl font-bold">{titulo}</h2><p className="mt-1 text-sm text-tinta-suave">Prueba cantidades y costos. La simulación no guarda movimientos.</p></div>
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${completo ? 'bg-sky-100 text-sky-900' : 'bg-amber-100 text-amber-900'}`}>{completo ? 'Gastos revisados' : 'Gastos por revisar'}</span>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5" aria-label="Ventas que quieres simular">
          <label className="block text-sm font-semibold">Tipo de cristal<select className={campo} value={perfilId} onChange={e => setPerfilId(e.target.value)}>{perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></label>
          <div className="mt-5 flex justify-between text-sm text-tinta-suave"><span>Línea y precio por par</span><span>Pares</span></div>
          <div className="mt-2 divide-y divide-tinta/10">{calculos.map(n => <div key={n.id} className="flex items-center justify-between gap-3 py-3">
            <div><p className="font-semibold">{n.nombre}</p><p className="mt-1 text-sm text-tinta-suave">{clp(n.precio)}</p></div>
            <label className="w-24 shrink-0"><span className="sr-only">Pares {n.nombre}</span><input className={campo} type="number" inputMode="numeric" min={0} max={9999} step={1} value={n.cantidad} onChange={e => setCantidades({ ...cantidades, [n.id]: numero(e.target.value, 9999) })}/></label>
          </div>)}</div>
          <div className="mt-3 flex justify-between border-t border-tinta/10 pt-4 font-semibold"><span>{r.cantidad} pares</span><span className="tabular-nums">{clp(r.ventas)} en ventas</span></div>
        </section>
        <details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <summary className="cursor-pointer font-semibold">Gastos de la salida <span className="ml-2 text-sm font-normal text-tinta-suave">{clp(totalFijos)}</span></summary>
          <p className="mt-4 text-sm text-tinta-suave">Los {clp(fijosRegistrados)} ya registrados están incluidos en el primer campo. Agrega solo gastos adicionales.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{(Object.entries({ registrados: 'Costos ya registrados', combustible: 'Combustible adicional', peajes: 'Peajes y TAG adicionales', hospedaje: 'Hospedaje adicional', comida: 'Comida adicional', sedes: 'Sedes adicionales', otros: 'Entrega y otros adicionales' }) as [keyof typeof fijos, string][]).map(([k, n]) => <label key={k} className="text-sm">{n}<input className={campo} type="number" inputMode="numeric" min={0} max={999999999} step={1} value={fijos[k]} onChange={e => setFijos({ ...fijos, [k]: numero(e.target.value) })}/></label>)}</div>
          <label className="mt-5 flex items-start gap-3 text-sm"><input className="mt-1 h-4 w-4 shrink-0 accent-accent" type="checkbox" checked={completo} onChange={e => setCompleto(e.target.checked)}/>Incluí todos los gastos de la salida.</label>
        </details>
        <details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <summary className="cursor-pointer font-semibold">Costos por par y comisiones</summary>
          <p className="mt-4 text-sm text-tinta-suave">Laboratorio: {clp(perfil.costo)} por par, con montaje e IVA. Rango ±2.00 / ±2.00; otras recetas pueden variar.</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{niveles.map(n => <label key={n.id} className="text-sm">Marco {n.nombre}<input className={campo} type="number" inputMode="numeric" min={0} max={999999999} step={1} value={marcos[n.id]} onChange={e => setMarcos({ ...marcos, [n.id]: numero(e.target.value) })}/></label>)}
            <label className="text-sm">Estuche y paño<input className={campo} type="number" inputMode="numeric" min={0} max={999999999} step={1} value={costos.estuche} onChange={e => setCostos({ ...costos, estuche: numero(e.target.value) })}/></label>
            <label className="text-sm">Comisión de venta (%)<input className={campo} type="number" inputMode="decimal" min={0} max={100} step={0.01} value={costos.vendedora} onChange={e => setCostos({ ...costos, vendedora: numero(e.target.value, 100, true) })}/></label>
            <label className="text-sm">Medio de pago<select className={campo} value={medio} onChange={e => setMedio(e.target.value)}>{historica !== null && <option value="historico">Mezcla de ventas anteriores</option>}<option value="debito">Todo débito</option><option value="credito">Todo crédito</option><option value="efectivo">Efectivo / transferencia</option></select></label>
          </div><p className="mt-3 text-sm text-tinta-suave">Marco y estuche son estimaciones editables. Comisión de cobro: {porcentaje(tasa)}. Tasas guardadas: débito {porcentaje(debito)} y crédito {porcentaje(credito)}.</p>
        </details>
      </div>
      <div className="space-y-4 lg:sticky lg:top-5">
        <section className={`rounded-2xl p-5 text-white ${r.resultado < 0 ? 'bg-red-900' : 'bg-tinta'}`} aria-label="Resultado del escenario" aria-live="polite" aria-atomic="true">
          <p className="text-sm opacity-85">{completo ? 'Ganancia estimada' : 'Ganancia provisional'} · con reserva IVA</p>
          <p className="mt-2 text-3xl font-bold tabular-nums sm:text-4xl">{clp(r.resultado)}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/20 pt-4">
            <div><p className="text-sm opacity-85">Margen estimado</p><p className="mt-1 text-xl font-bold tabular-nums">{porcentaje(r.margen)}</p></div>
            <div><p className="text-sm opacity-85">Pares para cubrir gastos</p><p className="mt-1 text-xl font-bold tabular-nums">{sinCantidad ? '—' : r.equilibrio === null ? 'No alcanza' : `≈ ${r.equilibrio}`}</p></div>
          </div>
          {!completo && <p className="mt-4 text-sm opacity-85">Revisa los gastos de la salida para completar la estimación.</p>}
          {sinCantidad && <p className="mt-4 text-sm">Ingresa pares para calcular margen y punto de equilibrio.</p>}
          {!sinCantidad && r.aportePorPar <= 0 && <p className="mt-4 text-sm">Cada par deja pérdida o aporte cero. Revisa precios y costos.</p>}
        </section>
        <details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <summary className="cursor-pointer font-semibold">Quiero ganar…</summary>
          <label className="mt-4 block text-sm">Meta de ganancia con reserva IVA<input className={campo} type="number" inputMode="numeric" min={0} max={999999999} step={1000} value={objetivo} onChange={e => setObjetivo(numero(e.target.value))}/></label>
          <p className="mt-3 text-sm">{r.paresObjetivo === null ? 'Elige una mezcla de pares con aporte positivo para calcular tu meta.' : <>Necesitarías aproximadamente <b>{r.paresObjetivo} pares</b> con esta mezcla de ventas.</>}</p>
        </details>
        <details className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <summary className="cursor-pointer font-semibold">Cómo se calcula</summary>
          <dl className="mt-4 space-y-3 text-sm">{[
            ['Ventas con IVA', r.ventas], ['Marcos, cristales y estuches', -variables], ['Comisiones de venta y cobro', -comisiones], ['Gastos de la salida', -totalFijos], ['Utilidad operativa antes de IVA', r.utilidadAntesReserva], ['Reserva IVA de venta', -r.reserva], ['Ganancia estimada con reserva', r.resultado],
          ].map(([n, v]) => <div className="flex justify-between gap-3" key={n}><dt>{n}</dt><dd className="shrink-0 font-semibold tabular-nums">{clp(Number(v))}</dd></div>)}</dl>
          <p className="mt-4 border-t border-tinta/10 pt-4 text-sm text-tinta-suave">Margen = ganancia con reserva ÷ ventas sin IVA ({clp(r.ventasNetas)}). La reserva es precio × 19/119; no se presumen créditos fiscales. Es una estimación conservadora, antes de renta, ahorro y reparto.</p>
          <p className="mt-3 text-sm text-tinta-suave">El equilibrio y la meta usan el aporte promedio de la mezcla elegida. Suponen cobro total y los mismos costos por par. No incluyen consultas ni sueldo fijo de los dueños.</p>
        </details>
      </div>
    </div>
  </section>;
}
