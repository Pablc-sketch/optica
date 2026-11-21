import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import { exigirRolPagina } from "@/lib/autorizacion";
import { aprobarSugerencia, descartarSugerencia } from "@/lib/actions/whatsapp";
import { fechaConDia, hoyEnChile } from "@/lib/fechas";

// WhatsApp de la óptica. Lentia no responde ni llama: tú sigues usando tu
// WhatsApp Business en el celular. Lentia recibe los mensajes nuevos y,
// cuando alguien pide inscribirse, deja una sugerencia «por confirmar».
// Solo al pulsar «Aprobar» la persona entra a la lista para llamar del
// operativo. La detección es con reglas dentro de Lentia: los chats no se
// mandan a servicios de IA.

type Sugerencia = {
  id: string; telefono: string; operativo_id: string | null; candidatos: string[]; nombre: string | null;
  nombre_origen: string | null; lugar: string | null; estado: string; actualizado_en: string; resuelto_en: string | null;
};
type Operativo = { id: string; nombre: string; fecha: string; fecha_fin: string | null; comuna: string | null };
type Mensaje = { telefono: string; direccion: string; texto: string; enviado_en: string };
type Chat = { telefono: string; nombre_perfil: string | null; ultimo_mensaje_en: string };

const VISTAS = [["por_confirmar", "Por confirmar"], ["aprobadas", "Aprobadas"], ["descartadas", "Descartadas"], ["chats", "Chats"]] as const;
type Vista = (typeof VISTAS)[number][0];

const hora = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// «Junta Labrador · 28-11-2026 (sábado) (Talagante)»: sede y fecha para elegir.
function textoOperativo(o: Operativo): string {
  const dias = o.fecha_fin && o.fecha_fin !== o.fecha ? `${fechaConDia(o.fecha)} al ${fechaConDia(o.fecha_fin)}` : fechaConDia(o.fecha);
  return `${o.nombre} · ${dias}${o.comuna ? ` (${o.comuna})` : ""}`;
}

function addDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function WhatsApp({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const { ver } = await searchParams;
  const vista: Vista = VISTAS.some(([v]) => v === ver) ? (ver as Vista) : "por_confirmar";
  const hoy = hoyEnChile();
  const estado = vista === "aprobadas" ? "aprobada" : vista === "descartadas" ? "descartada" : "pendiente";

  const [numeroRes, sugRes, opsRes, chatsRes] = await Promise.all([
    supabase.from("whatsapp_numeros").select("telefono_visible, activo, automatico, coexistencia").maybeSingle(),
    supabase.from("whatsapp_sugerencias").select("id, telefono, operativo_id, candidatos, nombre, nombre_origen, lugar, estado, actualizado_en, resuelto_en")
      .eq("tenant_id", tenantId).eq("estado", estado).order(estado === "pendiente" ? "creado_en" : "resuelto_en", { ascending: estado === "pendiente" }).limit(50),
    supabase.from("operativos").select("id, nombre, fecha, fecha_fin, comuna").eq("tenant_id", tenantId)
      .in("estado", vista === "por_confirmar" ? ["planificado"] : ["planificado", "realizado", "cancelado"])
      .gte("fecha", vista === "por_confirmar" ? addDias(hoy, -31) : "2000-01-01").order("fecha").limit(200),
    vista === "chats"
      ? supabase.from("whatsapp_chats").select("telefono, nombre_perfil, ultimo_mensaje_en").eq("tenant_id", tenantId).order("ultimo_mensaje_en", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Chat[], error: null }),
  ]);
  if (sugRes.error || opsRes.error || chatsRes.error) {
    return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">La bandeja de WhatsApp aún no está activada en la base de datos.</p>;
  }
  const sugerencias = (sugRes.data ?? []) as Sugerencia[];
  const operativos = (opsRes.data ?? []) as Operativo[];
  const proximos = operativos.filter((o) => (o.fecha_fin && o.fecha_fin > o.fecha ? o.fecha_fin : o.fecha) >= hoy);
  const chats = (chatsRes.data ?? []) as Chat[];
  const telefonos = [...new Set([...sugerencias.map((s) => s.telefono), ...chats.map((c) => c.telefono)])];
  const mensajesRes = telefonos.length
    ? await supabase.from("whatsapp_mensajes").select("telefono, direccion, texto, enviado_en").eq("tenant_id", tenantId)
        .in("telefono", telefonos).order("enviado_en", { ascending: false }).limit(telefonos.length * 4)
    : { data: [] as Mensaje[] };
  const mensajes = (mensajesRes.data ?? []) as Mensaje[];
  const ultimos = (tel: string, n: number) => mensajes.filter((m) => m.telefono === tel).slice(0, n).reverse();
  const numero = numeroRes.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <CabeceraPagina seccion="Atención" titulo="WhatsApp" />
      {!numero ? (
        <p className="rounded-2xl bg-crema-claro p-4 text-sm">
          Tu WhatsApp Business aún no está conectado. <Link href="/configuracion/integraciones" className="font-semibold underline">Conectarlo</Link>
        </p>
      ) : (
        <p className="text-sm text-tinta-suave">
          {numero.telefono_visible} · Sigues respondiendo desde tu celular; Lentia no envía mensajes ni llama.
          {!numero.activo && <b className="text-amber-900"> Recepción en pausa.</b>}
          {numero.activo && !numero.automatico && <b className="text-amber-900"> Sugerencias automáticas apagadas.</b>}
        </p>
      )}

      <nav className="flex flex-wrap gap-2 text-sm">
        {VISTAS.map(([v, t]) => (
          <Link key={v} href={v === "por_confirmar" ? "/whatsapp" : `/whatsapp?ver=${v}`}
            className={`rounded-full px-3 py-1.5 font-semibold ${vista === v ? "bg-brand text-white" : "border bg-white"}`}>{t}</Link>
        ))}
      </nav>

      {vista === "chats" ? (
        <ul className="space-y-2">
          {chats.length === 0 && <li className="rounded-2xl bg-white p-4 text-sm text-tinta-suave shadow-sm">Todavía no llegan mensajes.</li>}
          {chats.map((c) => (
            <li key={c.telefono} className="rounded-2xl bg-white p-3 text-sm shadow-sm">
              <p className="font-semibold">{c.nombre_perfil || "Sin nombre"} <a href={`tel:+${c.telefono}`} className="font-normal text-brand-dark underline">+{c.telefono}</a>
                <span className="float-right text-xs text-tinta-suave">{hora(c.ultimo_mensaje_en)}</span></p>
              {ultimos(c.telefono, 2).map((m, i) => (
                <p key={i} className={`mt-1 truncate ${m.direccion === "saliente" ? "text-right text-emerald-900" : ""}`}>{m.texto || "…"}</p>
              ))}
            </li>
          ))}
        </ul>
      ) : sugerencias.length === 0 ? (
        <p className="rounded-2xl bg-white p-4 text-sm text-tinta-suave shadow-sm">
          {vista === "por_confirmar" ? "No hay inscripciones por confirmar." : "No hay nada aquí todavía."}
        </p>
      ) : vista !== "por_confirmar" ? (
        <ul className="divide-y divide-tinta/10 rounded-2xl bg-white px-4 text-sm shadow-sm">
          {sugerencias.map((s) => {
            const op = operativos.find((o) => o.id === s.operativo_id);
            return (
              <li key={s.id} className="py-2">
                <b>{s.nombre || "Sin nombre"}</b> · +{s.telefono}{op ? ` → ${textoOperativo(op)}` : ""}
                {s.resuelto_en && <span className="block text-xs text-tinta-suave">{hora(s.resuelto_en)}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        sugerencias.map((s) => {
          const sugerido = s.operativo_id ? proximos.find((o) => o.id === s.operativo_id) : undefined;
          const posibles = proximos.filter((o) => s.candidatos.includes(o.id));
          const otros = proximos.filter((o) => !s.candidatos.includes(o.id) && o.id !== sugerido?.id);
          return (
            <article key={s.id} data-sugerencia={s.id} className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold">{s.nombre || "Sin nombre"} · <a href={`tel:+${s.telefono}`} className="font-normal text-brand-dark underline">+{s.telefono}</a></h2>
                <span className="text-xs text-tinta-suave">{hora(s.actualizado_en)}</span>
              </header>
              <p className={`rounded-xl px-3 py-2 text-sm ${sugerido ? "bg-sky-50 text-sky-950" : "bg-amber-50 text-amber-950"}`}>
                {sugerido
                  ? <>Operativo: <b>{textoOperativo(sugerido)}</b>{s.lugar ? <> · reconocido por «{s.lugar}»</> : null}</>
                  : <>Hay duda: {posibles.length > 1 ? "puede ser más de un operativo" : "no dijo la sede"}. Elige el operativo.</>}
                {s.nombre_origen === "perfil" && <span className="block text-xs">El nombre es el del perfil de WhatsApp; revísalo.</span>}
              </p>
              <div className="space-y-1 text-sm">
                {ultimos(s.telefono, 3).map((m, i) => (
                  <p key={i} className={m.direccion === "entrante" ? "mr-10 rounded-xl bg-crema-claro px-3 py-1.5" : "ml-10 rounded-xl bg-emerald-50 px-3 py-1.5 text-right"}>{m.texto || "…"}</p>
                ))}
              </div>
              <FormularioAgenda accion={aprobarSugerencia} etiqueta="Aprobar">
                <input type="hidden" name="id" value={s.id} />
                <label className="block text-sm">Operativo (sede y fecha)
                  <select name="operativo_id" defaultValue={sugerido?.id ?? ""} required className="w-full rounded-xl border bg-white px-2 py-2.5">
                    <option value="" disabled>Elegir…</option>
                    {sugerido && <option value={sugerido.id}>{textoOperativo(sugerido)}</option>}
                    {posibles.length > 0 && (
                      <optgroup label="Posibles">
                        {posibles.map((o) => <option key={o.id} value={o.id}>{textoOperativo(o)}</option>)}
                      </optgroup>
                    )}
                    <optgroup label="Otros operativos">
                      {otros.map((o) => <option key={o.id} value={o.id}>{textoOperativo(o)}</option>)}
                    </optgroup>
                  </select>
                </label>
                <p className="text-xs text-tinta-suave">Teléfono del chat: +{s.telefono}. Si inscribe a otra persona más, escríbela abajo.</p>
                {[s.nombre ?? "", ""].map((n, i) => (
                  <div key={i} className="grid grid-cols-[1fr_5.5rem] gap-2">
                    <label className="text-sm">{i === 0 ? "Nombre" : "Otra persona (opcional)"}
                      <input name={`nombre_${i}`} defaultValue={n} required={i === 0} maxLength={80} className="w-full rounded-xl border px-3 py-2.5" />
                    </label>
                    <label className="text-sm">Edad
                      <input name={`edad_${i}`} type="number" min={0} max={120} className="w-full rounded-xl border px-3 py-2.5" />
                    </label>
                  </div>
                ))}
              </FormularioAgenda>
              <FormularioAgenda accion={descartarSugerencia} etiqueta="Descartar">
                <input type="hidden" name="id" value={s.id} />
              </FormularioAgenda>
            </article>
          );
        })
      )}
    </div>
  );
}
