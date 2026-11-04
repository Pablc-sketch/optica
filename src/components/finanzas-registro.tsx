'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { guardarRegistroFinanzas } from '@/lib/actions/finanzas';
import { FUENTES, TIPOS_REGISTRO, type TipoRegistro } from '@/lib/finanzas';
import { PERSONAS_REVISION } from '@/lib/revision-financiera';
import { clp } from '@/lib/clp';
import { fechaLegible } from '@/lib/fechas';
import { montoCaja } from '@/lib/caja-fuentes';

const campo = 'mt-1.5 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:border-teal-600';
const consejos: Record<TipoRegistro,string> = {
  gasto:'Algo que ya pagaste para la óptica: arriendo, bandejas, insumos u otra compra.',
  sueldo:'Un pago ya realizado a Pablo, Pamela o Isadora. Se descuenta del pendiente del operativo.',
  retiro:'Un adelanto ya entregado. También se descuenta de lo que corresponde en el operativo.',
  aporte:'Dinero propio que una persona ingresó a la cuenta o al efectivo para un operativo. Aumenta lo que se le debe.',
  ahorro:'Dinero que efectivamente retiraste de esta caja para reservarlo como ahorro.',
  traslado:'Dinero que ya moviste entre Mercado Pago y el efectivo. El total del negocio no cambia.',
  devolucion:'La óptica devuelve a Pablo un gasto que él ya pagó. No registra el gasto por segunda vez.',
  conteo:'Cuenta el dinero físico. Se guarda la diferencia, sin ajustar automáticamente la caja.',
};
export type PersonalPendiente = { id:string; fecha:string; descripcion:string; pendiente:number };
export default function FinanzasRegistro({ id, hoy, operativos, personales, inicial = 'gasto', personaInicial = '', operativoInicial = '', gastoInicial = '' }: {
  id:string; hoy:string; operativos:{ id:string; nombre:string; fecha:string }[]; personales:PersonalPendiente[];
  inicial?:TipoRegistro; personaInicial?:string; operativoInicial?:string; gastoInicial?:string;
}) {
  const [tipo,setTipo] = useState<TipoRegistro>(inicial);
  const [monto,setMonto] = useState('');
  const [caja,setCaja] = useState('');
  const [persona,setPersona] = useState(personaInicial);
  const [direccion,setDireccion] = useState('deposito');
  const [gastoId,setGastoId] = useState(gastoInicial);
  const [estado,action,guardando] = useActionState(guardarRegistroFinanzas,{});
  const gasto = personales.find(g => g.id===gastoId);
  const n = montoCaja(monto,true);
  const nombre = PERSONAS_REVISION[persona as keyof typeof PERSONAS_REVISION] ?? 'la persona';
  const fuente = FUENTES[caja as keyof typeof FUENTES] ?? 'la cuenta elegida';
  const tienePersona = ['sueldo','retiro','aporte'].includes(tipo);
  const tieneOperativo = ['sueldo','retiro','aporte','ahorro'].includes(tipo);
  const tipoConCaja = !['traslado','conteo'].includes(tipo);
  const requiereDescripcion = tipo!=='conteo' && tipo!=='devolucion';
  const efecto = tipo==='conteo' ? 'Se compara con el efectivo registrado. El saldo no se modifica.'
    : tipo==='traslado' ? `${direccion==='deposito'?'Baja el efectivo y sube la cuenta':'Baja la cuenta y sube el efectivo'}. No cambia el total.`
    : tipo==='gasto' && caja==='personal' ? 'La cuenta y el efectivo no cambian. Se registra una deuda con Pablo.'
    : tipo==='aporte' ? `Entra dinero a ${fuente}. Se registra un aporte de ${nombre}, no una venta.`
    : tipo==='devolucion' ? `Sale dinero de ${fuente} y baja la deuda personal con Pablo. No duplica el gasto.`
    : tipo==='ahorro' ? `Sale dinero de ${fuente} y queda registrado como ahorro separado.`
    : tipo==='sueldo' || tipo==='retiro' ? `Sale dinero de ${fuente} y baja el pendiente de ${nombre} en el operativo elegido.`
    : `Sale dinero de ${fuente}. Queda registrado como gasto del negocio.`;
  if (estado.guardado) return <section role="status" className="mx-auto w-full max-w-2xl rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm">
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-800" aria-hidden="true">✓</span>
    <h2 className="mt-4 text-xl font-bold text-slate-950">Movimiento guardado</h2>
    <p className="mt-2 text-sm text-slate-600">{TIPOS_REGISTRO[tipo]} · {n!==null?clp(n):''}. El registro quedó en el historial.</p>
    <div className="mt-5 flex flex-wrap gap-3"><Link href="/caja?vista=movimientos" className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">Ver movimientos</Link>
      <Link href={`/caja/nuevo?otro=${id}`} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold">Registrar otro</Link><Link href="/caja" className="px-3 py-3 text-sm font-semibold text-slate-600">Volver al resumen</Link></div>
  </section>;
  return <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
    <form action={action} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <input type="hidden" name="id" value={id} />
      <fieldset disabled={guardando} className="grid min-w-0 gap-5 disabled:opacity-60">
        <label className="text-sm font-semibold text-slate-700">¿Qué quieres registrar?
          <select name="tipo" value={tipo} onChange={e=>{setTipo(e.target.value as TipoRegistro);setCaja('');setMonto('');}} className={campo}>
            {Object.entries(TIPOS_REGISTRO).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select><span className="mt-2 block text-sm font-normal text-slate-500">{consejos[tipo]}</span>
        </label>
        {tipo==='gasto' && <p className="rounded-xl bg-teal-50 p-3 text-sm text-teal-950">¿Es Fides, marcos o un costo que ya tiene el operativo? <Link href="/pagos?ver=costos" className="font-semibold underline">Regístralo en Por pagar</Link> para descontarlo de su pendiente.</p>}
        {tipo==='devolucion' && <label className="text-sm font-semibold text-slate-700">Gasto personal por devolver
          <select name="gasto_id" value={gastoId} onChange={e=>setGastoId(e.target.value)} required className={campo}>
            <option value="">Elige el gasto</option>{personales.map(g=><option key={g.id} value={g.id}>{g.descripcion} · pendiente {clp(g.pendiente)}</option>)}
          </select>{personales.length===0 && <span className="mt-2 block text-sm font-normal">No hay gastos personales pendientes. Registra primero el gasto con origen “Dinero personal de Pablo”.</span>}
          <input type="hidden" name="descripcion" value={gasto?`Devolución a Pablo: ${gasto.descripcion}`.slice(0,250):''} />
        </label>}
        {tienePersona && <label className="text-sm font-semibold text-slate-700">{tipo==='aporte'?'¿Quién puso el dinero?':'¿A quién se le pagó?'}
          <select name="persona" required value={persona} onChange={e=>setPersona(e.target.value)} className={campo}><option value="">Elige la persona</option>
            {Object.entries(PERSONAS_REVISION).filter(([k])=>k!=='ahorro').map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>}
        {tieneOperativo && <label className="text-sm font-semibold text-slate-700">Operativo
          <select key={tipo} name="operativo_id" defaultValue={operativoInicial} required className={campo}>
            <option value="">Elige el operativo</option>
            {operativos.map(o=><option key={o.id} value={o.id}>{o.nombre} · {fechaLegible(o.fecha)}</option>)}
          </select>
        </label>}
        {tipo==='traslado' && <label className="text-sm font-semibold text-slate-700">Dirección del traslado<select name="direccion" value={direccion} onChange={e=>setDireccion(e.target.value)} className={campo}><option value="deposito">Efectivo → Cuenta bancaria (Mercado Pago)</option><option value="retiro">Cuenta bancaria (Mercado Pago) → Efectivo</option></select></label>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">{tipo==='conteo'?'Efectivo contado':'Monto en pesos'}
            <input name="monto" inputMode="numeric" autoComplete="off" required value={monto} onChange={e=>setMonto(e.target.value)} placeholder="Ej. 25.000" className={campo} />
            {monto && n===null && <span className="mt-1 block text-xs font-normal text-red-800">Escribe pesos sin decimales: 25000 o 25.000.</span>}
            {gasto && tipo==='devolucion' && <span className="mt-1 block text-xs font-normal text-slate-500">Hasta {clp(gasto.pendiente)}</span>}
          </label>
          {tipo!=='conteo' && <label className="text-sm font-semibold text-slate-700">Fecha real<input type="date" name="fecha" required defaultValue={hoy} min={tipo==='devolucion'?gasto?.fecha:undefined} max={hoy} className={campo} /></label>}
        </div>
        {tipoConCaja && <label className="text-sm font-semibold text-slate-700">{tipo==='aporte'?'¿Dónde ingresó el dinero?':'¿De dónde salió el dinero?'}
          <select name="caja" value={caja} onChange={e=>setCaja(e.target.value)} required className={campo}><option value="">Elige el origen</option>
            {Object.entries(FUENTES).filter(([k])=>tipo==='gasto'||k!=='personal').map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
        </label>}
        {tipo==='gasto' && <label className="text-sm font-semibold text-slate-700">Categoría<select name="categoria" className={campo}><option value="otro">Otros gastos e insumos</option><option value="arriendo">Arriendo</option><option value="compra_inventario">Inventario y equipamiento</option></select></label>}
        {tipo!=='devolucion' && <label className="text-sm font-semibold text-slate-700">{tipo==='gasto'?'¿Qué se pagó?':tipo==='conteo'?'Nota (opcional)':'Descripción'}
          <input name="descripcion" required={requiereDescripcion} maxLength={250} placeholder={tipo==='gasto'?'Ej. Compra de bandejas para marcos':'Una nota para reconocer este movimiento'} className={campo} />
        </label>}
      </fieldset>
      {estado.error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">{estado.error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
        <button disabled={guardando || (tipo==='devolucion' && !gasto) || n===null || (tipo!=='conteo' && n<=0) || (tipo==='devolucion' && !!gasto && n>gasto.pendiente)} className="min-h-11 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">{guardando?'Guardando…':'Guardar movimiento'}</button>
        <Link href="/caja" className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-600">Cancelar</Link>
      </div>
    </form>
    <aside aria-label="Resumen antes de guardar" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 lg:sticky lg:top-36">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Antes de guardar</p><h2 className="mt-3 text-lg font-bold text-slate-900">{TIPOS_REGISTRO[tipo]}</h2>
      <p className="mt-2 text-3xl font-bold tabular-nums text-slate-950">{n!==null?clp(n):'—'}</p>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">{efecto}</p>
      <p className="mt-5 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">Registra únicamente movimientos que ya ocurrieron. Lentia guarda el registro; no transfiere dinero.</p>
    </aside>
  </div>;
}
