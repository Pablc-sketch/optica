import CabeceraPagina from "@/components/cabecera-pagina";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { simpleApiConfigurada } from '@/lib/simpleapi';
import ConexionSimpleApi from '@/components/conexion-simpleapi';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import FormularioAgenda from '@/components/formulario-agenda';
import { cambiarAutomatico, conectarWhatsapp, pausarWhatsapp } from '@/lib/actions/whatsapp';
import { whatsappConfigurado } from '@/lib/whatsapp-cloud';
export default async function Integraciones() {
  const { tenantId, supabase, user } = await exigirRolPagina(['admin']);
  const conectada = mercadoPagoConfigurado(tenantId);
  const [numeroRes, perfilRes] = await Promise.all([
    supabase.from('whatsapp_numeros').select('telefono_visible, activo, automatico').maybeSingle(),
    supabase.from('users').select('es_superadmin').eq('id', user.id).single(),
  ]);
  const numero = numeroRes.data;
  const superadmin = perfilRes.data?.es_superadmin === true;
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
      <h2 className="text-lg font-bold">WhatsApp Business</h2>
      <p className="mt-1 text-sm text-tinta-suave">{numero ? `${numero.telefono_visible ?? 'Número conectado'} · ${numero.activo ? 'Lentia lee los chats y la IA propone a qué operativo inscribir' : 'en pausa'}` : 'Lentia lee los chats de tu WhatsApp Business (tú sigues respondiendo desde el teléfono) y la IA propone a qué operativo inscribir a cada persona. Lentia nunca envía mensajes.'}</p>
      {numero && <div className="mt-3 flex flex-wrap items-center gap-3"><Link href="/whatsapp" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Abrir bandeja</Link><FormularioAgenda accion={pausarWhatsapp} etiqueta={numero.activo ? 'Pausar' : 'Reanudar'}>
        {!numero.activo && <input type="hidden" name="activo" value="on" />}
      </FormularioAgenda></div>}
      {numero && <div className="mt-3 rounded-xl bg-crema-claro p-3 text-sm">
        <p className="font-semibold">{numero.automatico ? 'La IA revisa sola los chats nuevos' : 'Revisión automática apagada'}</p>
        <p className="mt-1 text-tinta-suave">Si alguien dice su sede o localidad, queda «por confirmar» en ese operativo y te llega un correo para decir sí o no. Nunca le responde a nadie.</p>
        <div className="mt-2"><FormularioAgenda accion={cambiarAutomatico} etiqueta={numero.automatico ? 'Apagar' : 'Encender'}>
          {!numero.automatico && <input type="hidden" name="automatico" value="on" />}
        </FormularioAgenda></div>
      </div>}
      {superadmin ? <details className="mt-3 text-sm" open={!numero}><summary className="cursor-pointer font-semibold">{numero ? 'Cambiar número' : 'Conectar número'}</summary>
        <div className="mt-2">{whatsappConfigurado() ? <FormularioAgenda accion={conectarWhatsapp} etiqueta="Conectar">
          <label className="block text-sm">Identificador del número (Meta → WhatsApp → Configuración de la API)
            <input name="phone_number_id" inputMode="numeric" required className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
        </FormularioAgenda> : <p className="text-amber-900">Faltan las claves de Meta en Vercel (WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN).</p>}</div>
      </details> : !numero && <p className="mt-2 text-sm">Para activarlo, pide a Lentia que conecte tu número.</p>}
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
