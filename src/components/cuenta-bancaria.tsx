import Link from 'next/link';
import {leerEstadoCuenta,type EstadoCuenta} from '@/lib/cuenta-mercadopago';
import { clp } from '@/lib/clp';
export default async function CuentaBancaria({ tenantId, obligaciones, registrado, cuenta }: { tenantId: string; obligaciones?: number; registrado?: { saldo: number; maquina: number; transferencias: number; salidas: number; comisiones: number }; cuenta?:EstadoCuenta }) {
  const estado=cuenta??await leerEstadoCuenta(tenantId);
  const saldo=estado.saldo;
  return <section className="rounded-2xl bg-tinta p-5 text-white shadow-sm">
    <h2 className="font-bold">Cuenta bancaria (Mercado Pago)</h2>
    {saldo.estado === 'disponible' ? <><p className="mt-2 text-4xl font-bold tabular-nums text-emerald-300">{clp(saldo.disponible)}</p>
      <p className="mt-1 text-xs text-white/75">Disponible · consultado {new Date(saldo.consultadoEn).toLocaleString('es-CL',{timeZone:'America/Santiago',dateStyle:'short',timeStyle:'short'})}</p>
      {obligaciones !== undefined && <p className="mt-3 border-t border-white/20 pt-3 text-sm">Saldo bancario menos todos los pendientes y ahorro: <b>{clp(saldo.disponible-obligaciones)}</b></p>}</>
      : <><p className="mt-2 font-semibold">Saldo bancario no disponible</p><p className="mt-1 text-sm text-white/80">{saldo.estado === 'no_configurado' ? 'Conecta la cuenta en Configuración → Integraciones.' : saldo.estado === 'no_habilitado' ? 'Mercado Pago no habilitó esta consulta de saldo.' : 'No se pudo verificar el saldo de la cuenta.'}</p></>}
    {registrado && <details className="mt-4 rounded-xl border border-white/20 p-3" ><summary className="cursor-pointer font-semibold">Libro de Lentia · {clp(registrado.saldo)}</summary>
      <dl className="mt-3 grid gap-2 text-sm"><div className="flex justify-between gap-2 text-emerald-300"><dt>Ingresos máquina (débito y crédito)</dt><dd>+{clp(registrado.maquina)}</dd></div><div className="flex justify-between gap-2 text-emerald-300"><dt>Transferencias recibidas</dt><dd>+{clp(registrado.transferencias)}</dd></div><div className="flex justify-between gap-2 text-red-300"><dt>Salidas netas registradas</dt><dd>{clp(registrado.salidas)}</dd></div><div className="flex justify-between gap-2 text-red-300"><dt>Comisiones estimadas</dt><dd>{clp(registrado.comisiones)}</dd></div></dl>
      <p className="mt-3 text-xs text-white/75">Incluye cobros registrados en Lentia. La máquina puede liquidar después; transferencias o gastos sin registrar pueden producir diferencias.</p>
    </details>}
    {estado.point&&<p className="mt-3 text-sm text-white/80">{estado.point==='integrado'?'Máquina Point lista para cobros desde Lentia.':estado.point==='requiere_pdv'?'Máquina detectada: falta activar el modo integrado PDV.':estado.point==='sin_terminal'?'Esta cuenta no presenta una máquina Point compatible con la integración.':'Mercado Pago no habilitó la consulta de máquinas Point para esta conexión.'}</p>}
    <p className="mt-3 text-sm text-white/80">{estado.ultimaCorrecta?`Última sincronización de cobros: ${new Date(estado.ultimaCorrecta).toLocaleString('es-CL',{timeZone:'America/Santiago'})}`:'Sin una sincronización de cobros completa.'}</p>
    {estado.estado==='error'&&<p role="status" className="mt-2 rounded-xl bg-white/10 p-3 text-sm">No se ha podido actualizar el archivo de cobros.{estado.errorCodigo?` Diagnóstico: ${estado.errorCodigo}.`:''} Los datos anteriores no son una confirmación actual.</p>}
    <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold">
      <Link href="/caja/mercadopago" className="rounded-xl border border-white/40 px-3 py-2">Cobros y vouchers →</Link>
      {saldo.estado !== 'disponible' && <a href="https://www.mercadopago.cl/home" target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/40 px-3 py-2">Ver saldo en Mercado Pago ↗</a>}
    </div>
  </section>;
}
