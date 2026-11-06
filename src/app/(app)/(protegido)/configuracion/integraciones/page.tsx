import CabeceraPagina from "@/components/cabecera-pagina";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { simpleApiConfigurada } from '@/lib/simpleapi';
import ConexionSimpleApi from '@/components/conexion-simpleapi';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
export default async function Integraciones() {
  const { tenantId } = await exigirRolPagina(['admin']);
  const conectada = mercadoPagoConfigurado(tenantId);
  return <div className="mx-auto flex max-w-2xl flex-col gap-4">
    <Link href="/configuracion" className="text-sm underline">← Configuración</Link>
    <CabeceraPagina seccion="Administración" titulo="Cuentas y boletas" />
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Mercado Pago</h2>
      <p className="mt-1 text-sm text-tinta-suave">{conectada ? 'Cuenta de la óptica conectada · pagos cada 5 min' : 'Pendiente de vincular la cuenta de la óptica'}</p>
      {conectada ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link href="/caja/mercadopago" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Abrir caja MP</Link>
        <Link href="/configuracion/integraciones/mercadopago" className="text-sm underline">Archivo de vouchers</Link>
      </div> : <a href="https://www.mercadopago.cl/developers/panel/app" target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-xl border px-4 py-2 text-sm font-semibold">Vincular cuenta ↗</a>}
    </section>
    <section className="rounded-2xl bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Boletas electrónicas</h2>
      <ConexionSimpleApi configurada={simpleApiConfigurada(tenantId)} />
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-tinta-suave">SimpleAPI · requisitos</summary>
        <a href="https://www.simpleapi.cl/Productos/SimpleAPI" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline">Ver plan y requisitos ↗</a>
      </details>
    </section>
  </div>;
}
