import FormularioAgenda from "@/components/formulario-agenda";
import { createClient } from "@/lib/supabase/server";
import { cambiarCita, guardarAgendaOperativo } from "@/lib/actions/whatsapp";
import { diaCorto } from "@/lib/whatsapp-agenda";

// Horas tomadas por WhatsApp en un operativo, y (para el administrador) el
// interruptor para abrir las horas con su cupo por bloque.

type Cita = { id: string; fecha: string; hora: string; nombre: string; telefono: string; estado: string };

export default async function AgendaWhatsappOperativo({ operativoId }: { operativoId: string }) {
  const supabase = await createClient();
  const [opRes, citasRes, rolRes, numeroRes] = await Promise.all([
    supabase.from("operativos").select("agenda_whatsapp, cupos_por_bloque, minutos_bloque, hora_inicio, hora_fin, estado").eq("id", operativoId).maybeSingle(),
    supabase.from("citas_operativo").select("id, fecha, hora, nombre, telefono, estado").eq("operativo_id", operativoId).neq("estado", "cancelada").order("fecha").order("hora").order("creado_en"),
    supabase.rpc("jwt_rol"),
    supabase.from("whatsapp_numeros").select("telefono_visible, activo").maybeSingle(),
  ]);
  // Si la migración aún no está aplicada, la sección simplemente no aparece.
  if (opRes.error || !opRes.data || citasRes.error) return null;
  const op = opRes.data;
  const citas = (citasRes.data ?? []) as Cita[];
  const esAdmin = rolRes.data === "admin";
  if (!esAdmin && !op.agenda_whatsapp && citas.length === 0) return null;
  const numero = numeroRes.data;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Agendados por WhatsApp</h2>
        <span className="text-sm text-tinta-suave">{citas.filter((c) => c.estado === "agendada").length} agendados · {citas.filter((c) => c.estado === "asistio").length} asistieron</span>
      </div>

      {citas.length > 0 && (
        <ul className="mt-3 divide-y divide-tinta/10 text-sm">
          {citas.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-24 tabular-nums">{diaCorto(c.fecha)} {c.hora.slice(0, 5)}</span>
              <span className={`min-w-0 flex-1 font-medium ${c.estado === "asistio" ? "text-emerald-800" : ""}`}>{c.nombre}</span>
              <a href={`https://wa.me/${c.telefono}`} target="_blank" rel="noopener noreferrer" className="text-brand-dark underline">+{c.telefono}</a>
              {c.estado === "agendada" ? (
                <span className="flex gap-2">
                  <form action={async (d) => { "use server"; await cambiarCita(d); }}>
                    <input type="hidden" name="cita_id" value={c.id} />
                    <input type="hidden" name="estado" value="asistio" />
                    <button className="rounded-lg border px-2 py-1 text-xs font-semibold">Llegó</button>
                  </form>
                  <form action={async (d) => { "use server"; await cambiarCita(d); }}>
                    <input type="hidden" name="cita_id" value={c.id} />
                    <input type="hidden" name="estado" value="cancelada" />
                    <button className="rounded-lg border px-2 py-1 text-xs text-red-800">Anular</button>
                  </form>
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-800">Asistió</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {esAdmin && op.estado === "planificado" && (
        <details className="mt-3 rounded-xl bg-crema-claro p-3" open={!op.agenda_whatsapp && citas.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold">
            {op.agenda_whatsapp ? "Horas abiertas por WhatsApp · cambiar" : "Abrir horas por WhatsApp"}
          </summary>
          <div className="mt-3">
            {!numero && <p className="mb-2 text-sm text-amber-900">Primero hay que conectar el WhatsApp de la óptica en Configuración → Cuentas y boletas.</p>}
            {numero && !numero.activo && <p className="mb-2 text-sm text-amber-900">El WhatsApp de la óptica está en pausa.</p>}
            {!op.hora_inicio && <p className="mb-2 text-sm text-amber-900">Define el horario del operativo para poder abrir horas.</p>}
            <FormularioAgenda accion={guardarAgendaOperativo}>
              <input type="hidden" name="operativo_id" value={operativoId} />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" name="agenda_whatsapp" defaultChecked={op.agenda_whatsapp} className="size-4" />
                Las personas pueden tomar hora escribiendo al WhatsApp
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Personas por bloque
                  <input name="cupos_por_bloque" type="number" min={1} max={50} defaultValue={op.cupos_por_bloque} className="w-full rounded-xl border bg-white px-3 py-2.5" />
                </label>
                <label className="text-sm">
                  Cada bloque dura
                  <select name="minutos_bloque" defaultValue={op.minutos_bloque} className="w-full rounded-xl border bg-white px-3 py-2.5">
                    {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutos</option>)}
                  </select>
                </label>
              </div>
            </FormularioAgenda>
          </div>
        </details>
      )}
    </section>
  );
}
