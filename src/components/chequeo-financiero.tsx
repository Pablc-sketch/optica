'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clp } from '@/lib/clp';
import { fechaLegible } from '@/lib/fechas';
import { revisarMovimiento } from '@/lib/actions/revision-financiera';
import { conceptoProtegido, diferenciaRevision, PERSONAS_REVISION, type MovimientoRevision } from '@/lib/revision-financiera';
import { COSTOS, prefijoCosto, PREFIJO_FIDES, PREFIJO_MARCOS } from '@/lib/pagos-operativo';
import type { OperativoPorPagar } from '@/lib/por-pagar';

type Evento = { id: number; tabla: string; movimiento_id: string; antes: Record<string, unknown> | null; despues: Record<string, unknown> | null; motivo: string; created_at: string };
const campo = 'mt-1 w-full rounded-xl border border-tinta/20 bg-white px-3 py-3 text-base';
const titulo = (m: MovimientoRevision) => m.tabla === 'gastos_globales' ? m.descripcion : PERSONAS_REVISION[m.persona as keyof typeof PERSONAS_REVISION] ?? 'Pago';
const origen = (c: string) => c === 'digital' ? 'Cuenta bancaria' : c === 'personal' ? 'Dinero personal de Pablo' : 'Efectivo';
const conceptos = [
  { valor: PREFIJO_FIDES, nombre: 'Fides · cristales' }, { valor: PREFIJO_MARCOS, nombre: 'Marcos' },
  ...COSTOS.map(c => ({ valor: prefijoCosto(c.clave), nombre: c.titulo })),
];

export function ChequeoFinanciero({ movimientos, operativos, hoy, inicial, historial }: {
  movimientos: MovimientoRevision[]; operativos: OperativoPorPagar[]; hoy: string; inicial: string; historial: Evento[];
}) {
  const router = useRouter();
  const [operativo, setOperativo] = useState(inicial);
  const [tipo, setTipo] = useState('todos');
  const [estado, setEstado] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [editor, setEditor] = useState<{ movimiento: MovimientoRevision; nuevo: boolean } | null>(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const op = operativos.find(o => o.operativoId === operativo);
  const nombreOp = (id: string | null) => operativos.find(o => o.operativoId === id)?.nombre ?? 'Sin operativo';
  const base = movimientos.filter(m => !operativo || (operativo === 'sin' ? !m.operativo_id : m.operativo_id === operativo));
  const filas = base.filter(m => (tipo === 'todos' || (tipo === 'gastos' ? m.tabla === 'gastos_globales' : m.tabla === 'retiros_sueldo' && m.persona === tipo))
    && (estado === 'todos' || (estado === 'confirmados' ? !!m.confirmado_en : !m.confirmado_en))
    && `${titulo(m)} ${m.motivo ?? ''} ${nombreOp(m.operativo_id)}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
    .sort((a,b) => b.fecha.localeCompare(a.fecha) || b.id.localeCompare(a.id));
  const paginas = Math.max(1, Math.ceil(filas.length / 25));
  const paginaActual = Math.min(pagina, paginas - 1);
  function nuevo(ahorro = false) {
    setAviso(''); setError('');
    if (ahorro && !op) { setError('Selecciona un operativo para revisar su ahorro.'); return; }
    if (ahorro) {
      setTipo('ahorro'); setEstado('todos');
      const existentes = base.filter(m => m.tabla === 'retiros_sueldo' && m.persona === 'ahorro');
      if (existentes.length === 1) { setEditor({ nuevo:false, movimiento:{ ...existentes[0], monto:0, motivo:'No se apartó ahorro' } }); return; }
      if (existentes.length > 1) { setAviso('Este operativo tiene varios registros de ahorro. Revisa y corrige cada uno a $0 si no ocurrió.'); return; }
    }
    setEditor({ nuevo: true, movimiento: { id: crypto.randomUUID(), tabla:'retiros_sueldo', persona: ahorro ? 'ahorro' : 'isadora',
      monto:0, caja:'digital', fecha:hoy, operativo_id:op?.operativoId ?? null, revision_version:0, confirmado_en:null,
      motivo: ahorro ? 'No se apartó ahorro' : '', es_sueldo:true } });
  }
  function confirmar(m: MovimientoRevision) {
    setError(''); setAviso('');
    iniciar(async () => {
      try {
        const r = await revisarMovimiento({ movimiento:m, accion:'confirmar', motivo:'Movimiento confirmado en revisión' });
        if (!r.ok) setError(r.error ?? 'No se pudo confirmar.');
        else { setAviso('Registro confirmado.'); router.refresh(); }
      } catch { setError('No se pudo confirmar. Recarga y revisa antes de reintentar.'); }
    });
  }
  return <>
    <div className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">Operativo<select className={campo} value={operativo} onChange={e => { setOperativo(e.target.value); setPagina(0); }}><option value="">Todos</option><option value="sin">Sin operativo</option>{[...operativos].sort((a,b) => b.fecha.localeCompare(a.fecha)).map(o => <option key={o.operativoId} value={o.operativoId}>{fechaLegible(o.fecha)} · {o.nombre}</option>)}</select></label>
      <label className="text-sm">Qué revisar<select className={campo} value={tipo} onChange={e => { setTipo(e.target.value); setPagina(0); }}><option value="todos">Todo</option>{Object.entries(PERSONAS_REVISION).map(([id,n]) => <option key={id} value={id}>{n}</option>)}<option value="gastos">Gastos</option></select></label>
      <label className="text-sm">Estado<select className={campo} value={estado} onChange={e => { setEstado(e.target.value); setPagina(0); }}><option value="todos">Todos</option><option value="pendientes">Por confirmar</option><option value="confirmados">Confirmados</option></select></label>
      <label className="text-sm">Buscar<input className={campo} value={busqueda} onChange={e => { setBusqueda(e.target.value); setPagina(0); }} placeholder="Concepto o nota" /></label>
    </div>
    <p className="text-sm">{base.filter(m => !m.confirmado_en).length} por confirmar · {base.filter(m => m.confirmado_en).length} confirmados</p>
    {op && <section className="rounded-2xl bg-white p-4"><h2 className="font-bold">{op.nombre} · calculado y registrado</h2><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="py-2">Concepto</th><th>Calculado</th><th>Registrado</th><th>Diferencia</th></tr></thead><tbody>
      {Object.entries(PERSONAS_REVISION).map(([persona,nombre]) => {
        const calculado = persona === 'ahorro' ? op.ahorro : op.sueldos[persona as keyof typeof op.sueldos];
        const real = base.filter(m => m.tabla === 'retiros_sueldo' && m.persona === persona).reduce((s,m) => s + m.monto,0);
        const d = diferenciaRevision(calculado,real);
        return <tr key={persona} className="border-t border-tinta/10"><th className="py-3 pr-3">{nombre}</th><td className="pr-3">{clp(calculado)}</td><td className="pr-3">{clp(real)}</td><td className={d.extra ? 'text-amber-800' : ''}>{d.extra ? `${clp(d.extra)} extra` : d.pendiente ? `${clp(d.pendiente)} ${persona === 'ahorro' ? 'sin separar' : 'pendiente'}` : 'Cuadra'}</td></tr>;
      })}
    </tbody></table></div><p className="mt-2 text-xs text-tinta-suave">Registrado incluye movimientos por confirmar. El cálculo del reparto no cambia al corregir un pago.</p><Link href={`/operativos/${op.operativoId}/cierre`} className="mt-3 inline-block underline">Ver costos y reparto del operativo →</Link></section>}
    <div className="flex flex-wrap gap-2"><button disabled={pendiente} onClick={() => nuevo()} className="rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Agregar pago o gasto omitido</button><button disabled={pendiente} onClick={() => nuevo(true)} className="rounded-xl border px-4 py-3 font-semibold">No aparté ahorro</button></div>
    {editor && <EditorMovimiento key={editor.movimiento.id} {...editor} operativos={operativos} hoy={hoy} onCerrar={() => setEditor(null)} onGuardado={() => { setEditor(null); setAviso('Guardado y confirmado. Caja y pendientes actualizados.'); router.refresh(); }} />}
    {aviso && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-emerald-900">{aviso}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
    <div className="flex flex-col gap-3">{filas.slice(paginaActual*25,paginaActual*25+25).map(m => <article key={m.id} className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold">{titulo(m)}{m.tabla === 'retiros_sueldo' && m.monto < 0 ? ' · aporte al negocio' : ''}</h2><p className="text-sm text-tinta-suave">{nombreOp(m.operativo_id)} · {fechaLegible(m.fecha)} · {origen(m.caja)}</p></div><b className="shrink-0 tabular-nums">{clp(m.monto)}</b></div>
      {m.motivo && <p className="mt-1 text-sm">{m.motivo}</p>}
      <p className={`mt-2 text-sm ${m.confirmado_en ? 'text-emerald-800' : 'text-amber-800'}`}>{m.confirmado_en ? `Confirmado · ${new Date(m.confirmado_en).toLocaleString('es-CL',{ timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short' })}` : 'Por confirmar'}{m.monto === 0 ? ' · sin salida de dinero' : ''}</p>
      <div className="mt-3 flex gap-2">{!m.confirmado_en && <button disabled={pendiente || !!editor} onClick={() => confirmar(m)} className="rounded-xl bg-emerald-50 px-4 py-2 font-semibold text-emerald-900">Confirmar</button>}<button disabled={pendiente || !!editor} onClick={() => { setAviso(''); setEditor({movimiento:m,nuevo:false}); }} className="rounded-xl border px-4 py-2 font-semibold">Corregir</button></div>
    </article>)}</div>
    {filas.length === 0 && <p className="rounded-xl bg-white p-4">Sin registros con estos filtros.</p>}
    {paginas > 1 && <nav className="flex items-center justify-between" aria-label="Páginas de movimientos"><button disabled={paginaActual===0} onClick={() => setPagina(paginaActual-1)} className="rounded-xl border p-3">Anterior</button><span>{paginaActual+1} / {paginas}</span><button disabled={paginaActual===paginas-1} onClick={() => setPagina(paginaActual+1)} className="rounded-xl border p-3">Siguiente</button></nav>}
    <details className="rounded-2xl bg-white p-4"><summary className="cursor-pointer font-semibold">Historial de cambios · últimos 100</summary>
      {historial.filter(h => !operativo || (operativo === 'sin' ? !(h.despues?.operativo_id ?? h.antes?.operativo_id) : h.despues?.operativo_id === operativo || h.antes?.operativo_id === operativo)).map(h => <div key={h.id} className="mt-3 border-t pt-3 text-sm"><p className="font-semibold">{String(h.despues?.descripcion ?? h.antes?.descripcion ?? PERSONAS_REVISION[(h.despues?.persona ?? h.antes?.persona) as keyof typeof PERSONAS_REVISION] ?? 'Movimiento')} · {nombreOp((h.despues?.operativo_id ?? h.antes?.operativo_id ?? null) as string | null)}</p><p>{h.motivo}</p><p>{h.antes ? clp(Number(h.antes.monto)) : 'Sin registro'} → {h.despues ? clp(Number(h.despues.monto)) : 'Eliminado'} · {new Date(h.created_at).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</p><details className="mt-1"><summary className="cursor-pointer underline">Ver detalle anterior y nuevo</summary><p>Antes: {h.antes ? `${String(h.antes.fecha)} · ${origen(String(h.antes.caja))} · ${String(h.antes.motivo ?? h.antes.descripcion ?? '')}` : 'Sin registro'}</p><p>Después: {h.despues ? `${String(h.despues.fecha)} · ${origen(String(h.despues.caja))} · ${String(h.despues.motivo ?? h.despues.descripcion ?? '')}` : 'Eliminado'}</p></details></div>)}
      {historial.length===0 && <p className="mt-3 text-sm">Los cambios y confirmaciones quedarán registrados desde ahora.</p>}
    </details>
  </>;
}

function EditorMovimiento({ movimiento, nuevo, operativos, hoy, onCerrar, onGuardado }: {
  movimiento: MovimientoRevision; nuevo: boolean; operativos: OperativoPorPagar[]; hoy:string; onCerrar:()=>void; onGuardado:()=>void;
}) {
  const [m,setM] = useState(movimiento);
  const [motivo,setMotivo] = useState(nuevo ? 'Registro histórico omitido' : '');
  const [error,setError] = useState('');
  const [pendiente,iniciar] = useTransition();
  const protegido = !nuevo && conceptoProtegido(movimiento);
  const patch = (v: Partial<MovimientoRevision>) => setM(a => ({...a,...v}));
  return <form className="grid gap-3 rounded-2xl border-2 border-brand bg-white p-4" onSubmit={e => {
    e.preventDefault(); setError('');
    iniciar(async () => { try {
      const r = await revisarMovimiento({movimiento:m,accion:nuevo?'crear':'guardar',motivo});
      if (!r.ok) setError(r.error ?? 'No se pudo guardar.'); else onGuardado();
    } catch { setError('No se pudo guardar. Recarga y revisa el historial antes de reintentar.'); } });
  }}>
    <h2 className="text-lg font-bold">{nuevo?'Agregar registro':'Corregir registro'} · {titulo(m)}</h2>
    {nuevo && <label className="text-sm">Tipo<select className={campo} value={m.tabla} onChange={e => patch(e.target.value==='gastos_globales'?{tabla:'gastos_globales',descripcion:'',categoria:'otro',monto:Math.abs(m.monto)}:{tabla:'retiros_sueldo',persona:'isadora',caja:'digital'})}><option value="retiros_sueldo">Pago, adelanto o ahorro</option><option value="gastos_globales">Gasto ya pagado</option></select></label>}
    <label className="text-sm">Operativo<select disabled={protegido} className={campo} value={m.operativo_id ?? ''} onChange={e => patch({operativo_id:e.target.value || null, ...(nuevo && conceptoProtegido(m) ? {descripcion:''} : {})})}><option value="">Sin operativo</option>{operativos.map(o => <option key={o.operativoId} value={o.operativoId}>{o.nombre} · {fechaLegible(o.fecha)}</option>)}</select></label>
    {m.tabla==='retiros_sueldo' ? <>
      <label className="text-sm">Persona o ahorro<select className={campo} value={m.persona} onChange={e => patch({persona:e.target.value,monto:Math.abs(m.monto)})}>{Object.entries(PERSONAS_REVISION).map(([id,n]) => <option key={id} value={id}>{n}</option>)}</select></label>
      <label className="text-sm">Nota<input className={campo} value={m.motivo ?? ''} maxLength={250} onChange={e => patch({motivo:e.target.value})} /></label>
      {m.persona!=='ahorro' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!m.es_sueldo} onChange={e => patch({es_sueldo:e.target.checked})} />Es pago de sueldo (desmarcado: adelanto o aporte)</label>}
    </> : <>
      {nuevo && m.operativo_id && <label className="text-sm">Abonar a un costo del operativo<select className={campo} value={conceptos.find(c => m.descripcion?.startsWith(c.valor))?.valor ?? ''} onChange={e => patch({descripcion:e.target.value ? `${e.target.value}${operativos.find(o => o.operativoId===m.operativo_id)?.nombre}` : ''})}><option value="">Gasto general</option>{conceptos.map(c => <option key={c.valor} value={c.valor}>{c.nombre}</option>)}</select></label>}
      <label className="text-sm">Concepto<input className={campo} required readOnly={protegido || (nuevo && conceptoProtegido(m))} maxLength={250} value={m.descripcion ?? ''} onChange={e => patch({descripcion:e.target.value})} /></label>
      <label className="text-sm">Categoría<select className={campo} value={m.categoria ?? 'otro'} onChange={e => patch({categoria:e.target.value})}><option value="otro">Otro</option><option value="arriendo">Arriendo</option><option value="compra_inventario">Inventario</option></select></label>
    </>}
    <div className="grid grid-cols-2 gap-3"><label className="text-sm">Fecha real<input className={campo} type="date" max={hoy} required value={m.fecha} onChange={e => patch({fecha:e.target.value})} /></label><label className="text-sm">Monto real (pesos)<input className={campo} type="number" min={m.tabla==='retiros_sueldo' && m.persona!=='ahorro'?undefined:0} step="1" required value={Number.isNaN(m.monto)?'':m.monto} onChange={e => patch({monto:e.target.value===''?NaN:Number(e.target.value)})} /></label></div>
    <p className="text-xs text-tinta-suave">Si no ocurrió, deja $0. Un aporte al negocio se anota con monto negativo.</p>
    <label className="text-sm">De dónde salió<select className={campo} value={m.caja} onChange={e => patch({caja:e.target.value})}><option value="digital">Cuenta bancaria</option><option value="efectivo">Efectivo de la óptica</option>{m.tabla==='gastos_globales' && <option value="personal">Dinero personal de Pablo</option>}</select></label>
    <label className="text-sm">Motivo de la corrección<input className={campo} required maxLength={250} placeholder="Se pagaron $20.000 más / no se apartó ahorro…" value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
    <p className="text-sm">Guardar reemplaza este monto, confirma el registro y recalcula la caja. No transfiere dinero.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-900">{error}</p>}
    <div className="flex gap-2"><button disabled={pendiente} className="rounded-xl bg-brand px-4 py-3 font-semibold text-white">{pendiente?'Guardando…':'Guardar y confirmar'}</button><button type="button" disabled={pendiente} onClick={onCerrar} className="rounded-xl border px-4 py-3">Cancelar</button></div>
  </form>;
}
