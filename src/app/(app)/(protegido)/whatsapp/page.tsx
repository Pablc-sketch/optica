import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import AnalizarChats from "./analizar";
import { exigirRolPagina } from "@/lib/autorizacion";
import { descartarChat, inscribirDesdeChat } from "@/lib/actions/whatsapp";
import { necesitaAnalisis, type Sugerencia } from "@/lib/whatsapp-bandeja";
import { fechaLegible, hoyEnChile } from "@/lib/fechas";

// Bandeja de WhatsApp. Lentia no responde: la óptica sigue contestando
// desde su teléfono. Acá la IA lee cada chat, dice de qué sector es la
// persona y a qué operativo corresponde, y el administrador inscribe con
// un clic (nombre, teléfono y edad).

type Chat = {
  telefono: string;
  nombre_perfil: string | null;
  ultimo_mensaje_en: string;
  ultimo_entrante_en: string | null;
  analizado_en: string | null;
  estado: string;
  sugerencia: Sugerencia | null;
};
type Mensaje = { telefono: string; direccion: string; texto: string; enviado_en: string };
type Operativo = { id: string; nombre: string; fecha: string; comuna: string | null };

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function Bandeja({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const { ver } = await searchParams;
  const vista = ver === "inscritos" || ver === "descartados" ? ver : "pendientes";
  const estado = vista === "inscritos" ? "inscrito" : vista === "descartados" ? "descartado" : "pendiente";
  const hoy = hoyEnChile();
  const [numeroRes, chatsRes, opsRes] = await Promise.all([
    supabase.from("whatsapp_numeros").select("telefono_visible, activo").maybeSingle(),
    supabase.from("whatsapp_chats").select("telefono, nombre_perfil, ultimo_mensaje_en, ultimo_entrante_en, analizado_en, estado, sugerencia")
      .eq("tenant_id", tenantId).eq("estado", estado).order("ultimo_mensaje_en", { ascending: false }).limit(50),
    supabase.from("operativos").select("id, nombre, fecha, comuna").eq("tenant_id", tenantId).eq("estado", "planificado")
      .or(`fecha.gte.${hoy},fecha_fin.gte.${hoy}`).order("fecha").limit(40),
  ]);
  if (chatsRes.error || opsRes.error) {
    return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">La bandeja de WhatsApp aún no está activada en la base de datos.</p>;
  }
  const chats = (chatsRes.data ?? []) as Chat[];
  const operativos = (opsRes.data ?? []) as Operativo[];
  const mensajesRes = chats.length
    ? await supabase.from("whatsapp_mensajes").select("telefono, direccion, texto, enviado_en").eq("tenant_id", tenantId)
        .in("telefono", chats.map((c) => c.telefono)).order("enviado_en", { ascending: false }).limit(chats.length * 8)
    : { data: [] as Mensaje[] };
  const mensajes = (mensajesRes.data ?? []) as Mensaje[];
  const porAnalizar = vista === "pendientes" ? chats.filter(necesitaAnalisis).length : 0;
  const numero = numeroRes.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <CabeceraPagina seccion="Atención" titulo="WhatsApp" />
      {!numero ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm">
          Aún no está conectado el WhatsApp Business de la óptica. <Link href="/configuracion/integraciones" className="font-semibold underline">Ver cómo conectarlo</Link>
        </p>
      ) : (
        <p className="text-sm text-tinta-suave">
          {numero.telefono_visible} · Lentia solo lee: respondes tú desde tu WhatsApp. La IA propone el operativo y tú confirmas.
          {!numero.activo && <b className="text-amber-900"> En pausa.</b>}
        </p>
      )}

      <nav className="flex gap-2 text-sm">
        {(["pendientes", "inscritos", "descartados"] as const).map((v) => (
          <Link key={v} href={v === "pendientes" ? "/whatsapp" : `/whatsapp?ver=${v}`}
            className={`rounded-full px-3 py-1.5 font-semibold capitalize ${vista === v ? "bg-brand text-white" : "border bg-white"}`}>{v}</Link>
        ))}
      </nav>

      {vista === "pendientes" && porAnalizar > 0 && <AnalizarChats cantidad={porAnalizar} />}
      {chats.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-tinta-suave shadow-sm">No hay chats {vista}.</p>}

      {chats.map((c) => {
        const s = c.sugerencia;
        const ultimos = mensajes.filter((m) => m.telefono === c.telefono).slice(0, 6).reverse();
        const sugerido = s?.operativo_id ? operativos.find((o) => o.id === s.operativo_id) : undefined;
        return (
          <article key={c.telefono} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold">
                {c.nombre_perfil || "Sin nombre"}{" "}
                <a href={`https://wa.me/${c.telefono}`} target="_blank" rel="noopener noreferrer" className="text-sm font-normal text-brand-dark underline">+{c.telefono}</a>
              </h2>
              <span className="text-xs text-tinta-suave">{hora(c.ultimo_mensaje_en)}</span>
            </header>

            <div className="space-y-1 text-sm">
              {ultimos.map((m, i) => (
                <p key={i} className={m.direccion === "entrante" ? "mr-10 rounded-xl bg-crema-claro px-3 py-1.5" : "ml-10 rounded-xl bg-emerald-50 px-3 py-1.5 text-right"}>
                  {m.texto || "…"}
                </p>
              ))}
            </div>

            {vista === "pendientes" && (
              <>
                {s ? (
                  <p className={`rounded-xl px-3 py-2 text-sm ${sugerido ? "bg-sky-50 text-sky-950" : "bg-amber-50 text-amber-950"}`}>
                    <b>IA:</b> {s.sector ? `Sector «${s.sector}». ` : ""}
                    {sugerido ? `Corresponde a ${sugerido.nombre} (${fechaLegible(sugerido.fecha)}). ` : s.quiere_atenderse ? "Sin operativo claro. " : "No parece querer atenderse. "}
                    {s.motivo} <span className="text-xs">· confianza {s.confianza}</span>
                  </p>
                ) : necesitaAnalisis(c) ? (
                  <p className="text-xs text-tinta-suave">Pendiente de revisar por la IA.</p>
                ) : null}

                <FormularioAgenda accion={inscribirDesdeChat} etiqueta="Inscribir">
                  <input type="hidden" name="telefono" value={c.telefono} />
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_5.5rem]">
                    <label className="text-sm">Operativo
                      <select name="operativo_id" defaultValue={sugerido?.id ?? ""} required className="w-full rounded-xl border bg-white px-2 py-2.5">
                        <option value="" disabled>Elegir…</option>
                        {operativos.map((o) => (
                          <option key={o.id} value={o.id}>{fechaLegible(o.fecha)} · {o.nombre}{o.comuna ? ` (${o.comuna})` : ""}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">Nombre
                      <input name="nombre" defaultValue={s?.nombre ?? c.nombre_perfil ?? ""} required maxLength={80} className="w-full rounded-xl border px-3 py-2.5" />
                    </label>
                    <label className="text-sm">Edad
                      <input name="edad" type="number" min={0} max={120} defaultValue={s?.edad ?? ""} className="w-full rounded-xl border px-3 py-2.5" />
                    </label>
                  </div>
                </FormularioAgenda>
                <FormularioAgenda accion={descartarChat} etiqueta="No es para operativo">
                  <input type="hidden" name="telefono" value={c.telefono} />
                </FormularioAgenda>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
