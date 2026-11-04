import { randomUUID } from 'node:crypto';
import { exigirRolPagina } from '@/lib/autorizacion';
import { leerTodas } from '@/lib/leer-todas';
import { pendientePersonal } from '@/lib/caja-fuentes';
import { hoyEnChile } from '@/lib/fechas';
import { esTipoRegistro } from '@/lib/finanzas';
import FinanzasNav from '@/components/finanzas-nav';
import FinanzasRegistro from '@/components/finanzas-registro';

export const dynamic = 'force-dynamic';
export default async function NuevoMovimiento({ searchParams }: { searchParams:Promise<{ tipo?:string; persona?:string; operativo?:string; gasto?:string }> }) {
  const { supabase,tenantId } = await exigirRolPagina(['admin']);
  const [ops,gastos,devoluciones,params] = await Promise.all([
    leerTodas((a,b)=>supabase.from('operativos').select('id,nombre,fecha').eq('tenant_id',tenantId).order('fecha',{ascending:false}).order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('gastos_globales').select('id,fecha,descripcion,monto').eq('tenant_id',tenantId).eq('caja','personal').order('id').range(a,b)),
    leerTodas((a,b)=>supabase.from('caja_movimientos').select('gasto_id,monto').eq('tenant_id',tenantId).eq('tipo','devolucion').order('id').range(a,b)),
    searchParams,
  ]);
  const error = ops.error || gastos.error || devoluciones.error;
  const porGasto = new Map<string,number>();
  for (const d of devoluciones.data??[]) if (d.gasto_id) porGasto.set(d.gasto_id,(porGasto.get(d.gasto_id)??0)+d.monto);
  const personales = (gastos.data??[]).map(g=>({...g,pendiente:pendientePersonal(g.monto,[{monto:porGasto.get(g.id)??0}])})).filter(g=>g.pendiente>0);
  const id = randomUUID();
  return <div className="flex flex-col gap-5"><FinanzasNav titulo="Registrar movimiento" descripcion="Elige qué ocurrió, revisa el origen y guarda." nuevo={false} />
    {error?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">No se pudieron cargar los datos necesarios. Recarga antes de registrar.</p>
      :<FinanzasRegistro key={id} id={id} hoy={hoyEnChile()} operativos={ops.data??[]} personales={personales}
        inicial={esTipoRegistro(params.tipo??'')?params.tipo as Parameters<typeof FinanzasRegistro>[0]['inicial']:'gasto'}
        personaInicial={['pablo','madre','isadora'].includes(params.persona??'')?params.persona!:''}
        operativoInicial={(ops.data??[]).some(o=>o.id===params.operativo)?params.operativo!:''}
        gastoInicial={personales.some(g=>g.id===params.gasto)?params.gasto!:''} />}
  </div>;
}
