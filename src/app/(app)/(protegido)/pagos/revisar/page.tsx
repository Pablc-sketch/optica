import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { leerTodas } from '@/lib/leer-todas';
import { cargarPendientes } from '@/lib/resumen-pendientes';
import { hoyEnChile } from '@/lib/fechas';
import { ChequeoFinanciero } from '@/components/chequeo-financiero';
import type { MovimientoRevision } from '@/lib/revision-financiera';

export default async function RevisarPagos({ searchParams }: { searchParams: Promise<{ operativo?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(['admin']);
  const params = await searchParams;
  const [retiros, gastos, pendientes, historial] = await Promise.all([
    leerTodas((a,b) => supabase.from('retiros_sueldo').select('*').eq('tenant_id',tenantId).order('id').range(a,b)),
    leerTodas((a,b) => supabase.from('gastos_globales').select('*').eq('tenant_id',tenantId).order('id').range(a,b)),
    cargarPendientes(supabase),
    supabase.from('revisiones_financieras').select('id,tabla,movimiento_id,antes,despues,motivo,created_at').eq('tenant_id',tenantId).order('id',{ascending:false}).limit(100),
  ]);
  const error = retiros.error ?? gastos.error ?? pendientes.error ?? historial.error;
  return <div className="mx-auto flex max-w-4xl flex-col gap-4">
    <div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-bold">Revisar pagos y gastos</h1><Link href="/caja" className="underline">Caja</Link></div>
    <p className="text-sm text-tinta-suave">Confirma lo que ocurrió. Corregir actualiza la caja y los pendientes; cada cambio queda en el historial.</p>
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-900">No se pudo cargar la revisión completa. Recarga antes de corregir.</p> : <ChequeoFinanciero
      movimientos={[
        ...(retiros.data ?? []).map(r => ({ ...r, tabla:'retiros_sueldo' as const })),
        ...(gastos.data ?? []).map(g => ({ ...g, tabla:'gastos_globales' as const })),
      ] as MovimientoRevision[]}
      operativos={pendientes.detalle} hoy={hoyEnChile()} inicial={params.operativo ?? ''} historial={historial.data ?? []} />}
  </div>;
}
