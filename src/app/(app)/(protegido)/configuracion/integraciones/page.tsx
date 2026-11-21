import CabeceraPagina from "@/components/cabecera-pagina";
import Link from 'next/link';
import { exigirRolPagina } from '@/lib/autorizacion';
import { simpleApiConfigurada } from '@/lib/simpleapi';
import ConexionSimpleApi from '@/components/conexion-simpleapi';
import { mercadoPagoConfigurado } from '@/lib/mercadopago-sync';
import FormularioAgenda from '@/components/formulario-agenda';
import { cambiarAutomatico, conectarWhatsapp, pausarWhatsapp } from '@/lib/actions/whatsapp';
import { altaMetaConfigurada, GRAPH_VERSION, whatsappConfigurado } from '@/lib/whatsapp-cloud';
import ConectarWhatsappMeta from '@/components/conectar-whatsapp-meta';
export default async function Integraciones() {
  const { tenantId, supabase, user } = await exigirRolPagina(['admin']);
  const conectada = mercadoPagoConfigurado(tenantId);
  const [numeroRes, perfilRes] = await Promise.all([
    supabase.from('whatsapp_numeros').select('telefono_visible, activo, automatico, coexistencia').maybeSingle(),
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
      <p className="mt-1 text-sm text-tinta-suave">{numero
        ? `${numero.telefono_visible ?? 'Número conectado'}${numero.coexistencia ? ' · sigue en tu celular' : ''} · ${numero.activo ? 'Lentia recibe los mensajes nuevos' : 'recepción en pausa'}`
        : 'Sigues usando tu WhatsApp Business en el celular. Lentia recibe los mensajes nuevos y te sugiere inscripciones para aprobar. Lentia nunca envía mensajes ni llama.'}</p>
      {numero && <div className="mt-3 flex flex-wrap items-center gap-3"><Link href="/whatsapp" className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Abrir «Por confirmar»</Link><FormularioAgenda accion={pausarWhatsapp} etiqueta={numero.activo ? 'Pausar recepción' : 'Reanudar recepción'}>
        {!numero.activo && <input type="hidden" name="activo" value="on" />}
      </FormularioAgenda></div>}
      {numero && <div className="mt-3 rounded-xl bg-crema-claro p-3 text-sm">
        <p className="font-semibold">{numero.automatico ? 'Sugerencias automáticas encendidas' : 'Sugerencias automáticas apagadas'}</p>
        <p className="mt-1 text-tinta-suave">Cuando alguien pide inscribirse y dice la sede o localidad, aparece en «Por confirmar» con nombre, teléfono y operativo. Se detecta dentro de Lentia, sin enviar los chats a servicios de IA.</p>
        <div className="mt-2"><FormularioAgenda accion={cambiarAutomatico} etiqueta={numero.automatico ? 'Apagar' : 'Encender'}>
          {!numero.automatico && <input type="hidden" name="automatico" value="on" />}
        </FormularioAgenda></div>
      </div>}
      {!numero && (altaMetaConfigurada()
        ? <div className="mt-3"><ConectarWhatsappMeta appId={process.env.NEXT_PUBLIC_META_APP_ID!} configId={process.env.NEXT_PUBLIC_META_CONFIG_ID!} version={GRAPH_VERSION} /></div>
        : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Falta configurar la app de Meta en el servidor (Vercel): NEXT_PUBLIC_META_APP_ID, NEXT_PUBLIC_META_CONFIG_ID, WHATSAPP_APP_SECRET y WHATSAPP_VERIFY_TOKEN.</p>)}
      <details className="mt-3 text-sm"><summary className="cursor-pointer text-tinta-suave">Datos para la app de Meta</summary>
        <p className="mt-2">URL de devolución de llamada (webhook): <code className="break-all">https://lentiaapp.cl/api/whatsapp/webhook</code></p>
        <p>Campos a suscribir: <code>messages</code>, <code>smb_message_echoes</code>, <code>account_update</code>.</p>
      </details>
      {superadmin && whatsappConfigurado() && <details className="mt-3 text-sm"><summary className="cursor-pointer text-tinta-suave">Conexión manual (avanzado)</summary>
        <div className="mt-2"><FormularioAgenda accion={conectarWhatsapp} etiqueta="Conectar">
          <label className="block text-sm">Identificador del número (Meta → WhatsApp → Configuración de la API)
            <input name="phone_number_id" inputMode="numeric" required className="mt-1 w-full rounded-xl border px-3 py-2.5" /></label>
        </FormularioAgenda></div>
      </details>}
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
