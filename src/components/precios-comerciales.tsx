import Link from 'next/link';
import {exigirRolPagina} from '@/lib/autorizacion';
import {leerTodas} from '@/lib/leer-todas';
import {guardarPrecioPropio} from '@/lib/actions/precios-comerciales';
import {configuracionModelo} from '@/lib/modelo-optica';
import {clp} from '@/lib/clp';
import FormularioAgenda from './formulario-agenda';
const campo='w-full rounded-xl border px-3 py-2.5 text-base';
function Monto({name,label,valor}:{name:string;label:string;valor?:number|null}){return <label className="text-sm">{label}<input className={campo} name={name} type="number" min={0} max={999999999} step={1} required defaultValue={valor??''}/></label>}
export default async function PreciosComerciales(){
 const {supabase,tenantId}=await exigirRolPagina(['admin']);
 const [config,productos,cristales,labs]=await Promise.all([
  configuracionModelo(supabase),
  leerTodas((a,b)=>supabase.from('productos').select('id,nombre,categoria,costo,precio_venta').eq('tenant_id',tenantId).order('nombre').order('id').range(a,b)),
  leerTodas((a,b)=>supabase.from('costos_cristales').select('id,tipo_lente,rango_receta,tratamiento,costo,precio_venta,proveedor_id,tarifa_config,nombre_laboratorio').eq('tenant_id',tenantId).order('tipo_lente').order('id').range(a,b)),
  supabase.from('proveedores').select('id,nombre').eq('tenant_id',tenantId).eq('tipo','laboratorio').order('nombre'),
 ]);
 if(productos.error||cristales.error||labs.error)throw new Error('No se pudieron cargar los precios.');
 type Fila=NonNullable<typeof cristales.data>[number];
 const cristalForm=(r?:Fila)=>{
  const t=r?.tarifa_config as {tarifa:number;unidad:string;montaje:number;iva_pct:number}|null;
  return <FormularioAgenda accion={guardarPrecioPropio} etiqueta="Guardar cristal"><input type="hidden" name="tipo" value="cristal"/><input type="hidden" name="id" value={r?.id??''}/>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <label className="text-sm">Tipo<select name="tipo_lente" className={campo} defaultValue={r?.tipo_lente??'Monofocal'}>{['Monofocal','Bifocal','Multifocal'].map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-sm">Rango máximo (esfera / cilindro)<input name="rango_receta" required className={campo} placeholder="±4.00 / ±2.00" defaultValue={r?.rango_receta??''}/></label>
    <label className="text-sm">Tratamiento o producto<input name="tratamiento" required maxLength={120} className={campo} defaultValue={r?.tratamiento??''}/></label>
    <label className="text-sm">Laboratorio<select name="proveedor_id" required className={campo} defaultValue={r?.proveedor_id??''}><option value="">Elegir…</option>{(labs.data??[]).map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    <label className="text-sm">Nombre en el laboratorio<input name="nombre_laboratorio" maxLength={120} className={campo} defaultValue={r?.nombre_laboratorio??''}/></label>
    <label className="text-sm">Tarifa por<select className={campo} name="unidad" defaultValue={t?.unidad??'par'}><option value="par">Par de cristales</option><option value="unidad">Un cristal</option></select></label>
    <Monto name="tarifa" label="Tarifa del laboratorio" valor={t?.tarifa}/><Monto name="montaje" label="Montaje por par" valor={t?.montaje}/>
    <label className="text-sm">Impuesto a agregar (%)<input name="iva_pct" type="number" min={0} max={100} step="0.01" required className={campo} defaultValue={t?.iva_pct??''} placeholder="0 si ya está incluido"/></label>
    <Monto name="precio" label="Precio final al cliente por par" valor={r?.precio_venta}/>
   </div>{r&&<p className="text-sm">Costo final del par: <b>{clp(r.costo)}</b></p>}
  </FormularioAgenda>;
 };
 return <div className="space-y-5"><div><h1 className="text-2xl font-bold">Precios de mi óptica</h1><p className="text-sm text-tinta-suave">Define tus tarifas y laboratorios.</p></div>
  <section className="rounded-2xl bg-white p-4 shadow-sm"><h2 className="mb-3 font-bold">Consulta / receta</h2><FormularioAgenda accion={guardarPrecioPropio}><input type="hidden" name="tipo" value="consulta"/><Monto name="precio" label="Precio final de la consulta" valor={config.precioConsulta}/><p className="text-xs text-tinta-suave">Usa 0 si la consulta no tiene cobro.</p></FormularioAgenda></section>
  <section className="space-y-3"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-bold">Marcos y productos</h2><Link href="/inventario" className="text-sm underline">Agregar desde Inventario</Link></div>
   {!productos.data?.length&&<p className="rounded-xl bg-white p-4 text-sm">Todavía no hay productos. Agrega tus marcos para definir costo y venta.</p>}
   {(productos.data??[]).map(r=><details key={r.id} className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">{r.nombre} · {clp(r.precio_venta)}</summary><div className="mt-3"><FormularioAgenda accion={guardarPrecioPropio}><input type="hidden" name="tipo" value="producto"/><input type="hidden" name="id" value={r.id}/><div className="grid grid-cols-2 gap-3"><Monto name="costo" label="Costo de compra" valor={r.costo}/><Monto name="precio" label="Precio final al cliente" valor={r.precio_venta}/></div></FormularioAgenda></div></details>)}
  </section>
  <section className="space-y-3"><h2 className="font-bold">Cristales por laboratorio</h2>
   {!labs.data?.length?<p className="rounded-xl bg-white p-4 text-sm">Agrega primero tu laboratorio en <Link href="/inventario" className="underline">Inventario → Proveedores</Link>.</p>:<details className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">＋ Agregar tarifa de cristal</summary><div className="mt-3">{cristalForm()}</div></details>}
   {(cristales.data??[]).map(r=><details key={r.id} className="rounded-xl bg-white p-4"><summary className="cursor-pointer font-semibold">{r.tipo_lente} · {r.tratamiento} · {r.rango_receta} · {clp(r.precio_venta)}</summary><div className="mt-3">{cristalForm(r)}</div></details>)}
   {!cristales.data?.length&&<p className="text-sm text-tinta-suave">Catálogo vacío. Agrega las tarifas de tu laboratorio para empezar a cotizar.</p>}
  </section>
 </div>;
}
