'use client';
import {useState} from 'react';
import {ROLES_AGENDA,type RecursoAgenda} from '@/lib/agenda-terreno';
import {seCruzanReservas,type ReservaEquipo} from '@/lib/disponibilidad-equipo';
const campo='w-full rounded-xl border bg-white px-3 py-2.5 text-base';
export default function CamposTurno({id,inicial,equipo,reservas}:{id:string;inicial:{fecha:string;fecha_fin:string;inicio:string;fin:string;asignados:Record<string,string>};equipo:RecursoAgenda[];reservas:ReservaEquipo[]}){
 const [valores,cambiar]=useState(inicial),rango={fecha:valores.fecha,fecha_fin:valores.fecha_fin||null,hora_inicio:valores.inicio||null,hora_fin:valores.fin||null};
 const ocupado=(rid:string)=>reservas.find(r=>r.id!==id&&r.recursos.includes(rid)&&seCruzanReservas(rango,r));
 const choques=Object.values(valores.asignados).map(ocupado).filter(Boolean);
 return <><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{([['fecha','Día de inicio','date'],['fecha_fin','Último día','date'],['inicio','Hora de inicio','time'],['fin','Hora de término','time']] as const).map(([k,label,type])=><label className="min-w-0 text-sm font-medium" key={k}>{label}<input name={k} type={type} value={valores[k]} onChange={e=>cambiar(v=>({...v,[k]:e.target.value}))} required={k==='fecha'} min={k==='fecha_fin'?valores.fecha:undefined} className={campo}/></label>)}</div>
 <p className="text-xs text-tinta-suave">Sin horas se reservan jornadas completas. Varios días reservan todo el período, incluidas las noches.</p><h2 className="border-t border-tinta/10 pt-3 font-bold">Personal y kit</h2>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{Object.entries(ROLES_AGENDA).map(([k,label])=><label key={k} className="min-w-0 text-sm font-medium">{label}<select name={k} required value={valores.asignados[k]||''} onChange={e=>cambiar(v=>({...v,asignados:{...v.asignados,[k]:e.target.value}}))} className={campo}><option value="">Elegir…</option>{equipo.filter(r=>r.tipo===k).map(r=>{const choque=ocupado(r.id);return <option key={r.id} value={r.id} disabled={!!choque}>{r.nombre}{choque?' · Ocupado: '+choque.nombre:''}</option>})}</select></label>)}</div>
 {choques.length>0&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Hay recursos ocupados. Cambia la asignación o el período antes de guardar.</p>}</>;
}
