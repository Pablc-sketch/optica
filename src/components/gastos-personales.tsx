import {randomUUID} from 'node:crypto';
import {clp} from '@/lib/clp';
import {fechaLegible} from '@/lib/fechas';
import {confirmarImportePersonal,guardarNotaGasto} from '@/lib/actions/caja';
import CajaFormulario from '@/components/caja-formulario';
import BotonEnviar from '@/components/boton-enviar';

export type GastoPersonal={id:string;fecha:string;descripcion:string;monto:number;nota?:string;monto_estimado?:boolean;pendiente:number};
const campo='mt-1 w-full rounded-xl border bg-white px-3 py-3 text-base';
export default function GastosPersonales({gastos,hoy}:{gastos:GastoPersonal[];hoy:string}){
 if(!gastos.length)return null;
 const pendiente=gastos.reduce((s,g)=>s+g.pendiente,0);
 return <details id="adelantos-personales" className="scroll-mt-6 rounded-2xl border border-tinta/10 bg-white p-4">
  <summary className="cursor-pointer font-semibold">Dinero personal por devolver <strong className="ml-2 tabular-nums text-red-800">{clp(-pendiente)}</strong></summary>
  <ul className="divide-y divide-tinta/15">{gastos.map(g=><li key={g.id} className="p-5 sm:p-6">
   <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-bold text-tinta">{g.descripcion}</h3><p className="mt-1 text-sm text-tinta-suave">{fechaLegible(g.fecha)} · Pagado de bolsillo</p></div><strong className="text-2xl font-bold text-red-900 tabular-nums">{clp(-g.pendiente)}</strong></div>
   {g.nota&&<div className="mt-4 rounded-xl border border-tinta/15 bg-crema p-4"><p className="text-sm font-bold text-tinta">Nota de la compra</p><p className="mt-1 whitespace-pre-wrap break-words text-base leading-relaxed text-tinta">{g.nota}</p></div>}
   <dl className="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt className="text-tinta-suave">Pagado personalmente</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{clp(g.monto)}</dd></div><div><dt className="text-tinta-suave">Ya devuelto</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{clp(g.monto-g.pendiente)}</dd></div></dl>
   <div className="mt-4 flex flex-col gap-3">
    <details className="rounded-xl border border-tinta/20 p-3"><summary className="min-h-7 cursor-pointer text-base font-semibold">Editar nota</summary><form action={guardarNotaGasto} className="mt-3 space-y-3"><input type="hidden" name="gasto_id" value={g.id}/><label className="block text-sm font-semibold">Qué se compró y para qué<textarea name="nota" rows={4} maxLength={1000} defaultValue={g.nota??''} className={campo}/></label><BotonEnviar className="min-h-11 rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Guardar nota</BotonEnviar></form></details>
    {g.monto_estimado?<details className="rounded-xl border border-amber-300 bg-amber-50 p-3"><summary className="cursor-pointer font-semibold text-amber-950">Importe aproximado: confirmar antes de devolver</summary><form action={confirmarImportePersonal} className="mt-3 space-y-3"><input type="hidden" name="gasto_id" value={g.id}/><input type="hidden" name="volver_gastos" value="1"/><label className="block text-sm">Total exacto del comprobante<input type="number" name="monto" min={1} step={1} defaultValue={g.monto} required className={campo}/></label><BotonEnviar className="min-h-11 rounded-xl bg-tinta px-4 py-3 font-semibold text-white">Confirmar importe</BotonEnviar></form></details>:<details className="rounded-xl border border-tinta/20 p-3"><summary className="min-h-7 cursor-pointer text-base font-semibold">Registrar una devolución</summary><p className="my-3 text-sm leading-relaxed text-tinta-suave">Registra solo lo que ya devolviste. Esto reduce la deuda y la caja de origen; no vuelve a sumar el gasto.</p><CajaFormulario texto="Guardar devolución realizada"><input type="hidden" name="id" value={randomUUID()}/><input type="hidden" name="tipo" value="devolucion"/><input type="hidden" name="volver_gastos" value="1"/><input type="hidden" name="gasto_id" value={g.id}/><input type="hidden" name="descripcion" value={`Devolución personal: ${g.descripcion}`.slice(0,250)}/><label className="block text-sm">Monto devuelto<input type="number" name="monto" min={1} max={g.pendiente} step={1} required className={campo}/></label><label className="block text-sm">Fecha<input type="date" name="fecha" defaultValue={hoy} min={g.fecha} max={hoy} required className={campo}/></label><label className="block text-sm">Salió desde<select name="caja" className={campo}><option value="digital">Cuenta Mercado Pago</option><option value="efectivo">Efectivo</option></select></label></CajaFormulario></details>}
   </div>
  </li>)}</ul>
 </details>;
}
