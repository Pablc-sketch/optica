import FormularioAgenda from "@/components/formulario-agenda";
import { createClient } from "@/lib/supabase/server";
import { cambiarInscrito, confirmarPreinscrito, guardarSectores, inscribirManual } from "@/lib/actions/whatsapp";

// Personas inscritas en un operativo (desde la bandeja de WhatsApp o a
// mano), y los sectores que cubre, que la IA usa para reconocer a quién
// corresponde cada chat.

type Inscrito = { id: string; nombre: string; telefono: string; edad: number | null; estado: string; origen: string; sector: string | null; motivo: string | null };

function Respuesta({ id, si }: { id: string; si: boolean }) {
  return (
    <form action={async (d) => { "use server"; await confirmarPreinscrito(d); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="respuesta" value={si ? "si" : "no"} />
      <button className={`rounded-lg px-2 py-1 text-xs font-semibold ${si ? "bg-emerald-700 text-white" : "border text-red-800"}`}>{si ? "Sí, inscribir" : "No"}</button>
    </form>
  );
}

function Boton({ id, estado, texto, clase }: { id: string; estado: string; texto: string; clase: string }) {
  return (
    <form action={async (d) => { "use server"; await cambiarInscrito(d); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button className={`rounded-lg border px-2 py-1 text-xs font-semibold ${clase}`}>{texto}</button>
    </form>
  );
}

export default async function InscritosOperativo({ operativoId }: { operativoId: string }) {
  const supabase = await createClient();
  const [opRes, inscritosRes, rolRes] = await Promise.all([
    supabase.from("operativos").select("sectores, meta_examenes, estado").eq("id", operativoId).maybeSingle(),
    supabase.from("inscritos_operativo").select("id, nombre, telefono, edad, estado, origen, sector, motivo").eq("operativo_id", operativoId)
      .neq("estado", "cancelado").order("creado_en"),
    supabase.rpc("jwt_rol"),
  ]);
  // Si la migración aún no está aplicada, la sección no aparece.
  if (opRes.error || !opRes.data || inscritosRes.error) return null;
  const op = opRes.data;
  const inscritos = (inscritosRes.data ?? []) as Inscrito[];
  const esAdmin = rolRes.data === "admin";
  const porConfirmar = inscritos.filter((i) => i.estado === "por_confirmar");
  const vigentes = inscritos.length - porConfirmar.length;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Inscritos</h2>
        <span className="text-sm text-tinta-suave">
          {vigentes}{op.meta_examenes ? ` de ${op.meta_examenes} (meta)` : ""} · {inscritos.filter((i) => i.estado === "asistio").length} llegaron
        </span>
      </div>

      {porConfirmar.length > 0 && (
        <ul className="mt-3 space-y-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
          <li className="font-semibold">La IA anotó desde WhatsApp. ¿Son de esta sede?</li>
          {porConfirmar.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="min-w-0 flex-1">
                <b>{p.nombre}</b>{p.edad !== null ? `, ${p.edad} años` : ""}{p.sector ? ` · dijo «${p.sector}»` : ""}
                {p.motivo && <span className="block text-xs">{p.motivo}</span>}
              </span>
              {esAdmin && <span className="flex gap-2"><Respuesta id={p.id} si /><Respuesta id={p.id} si={false} /></span>}
            </li>
          ))}
        </ul>
      )}

      {vigentes === 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">Todavía no hay personas inscritas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-tinta/10 text-sm">
          {inscritos.filter((p) => p.estado !== "por_confirmar").map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={`min-w-0 flex-1 font-medium ${p.estado === "asistio" ? "text-emerald-800" : ""}`}>
                {p.nombre}{p.edad !== null ? `, ${p.edad} años` : ""}
                {p.origen === "whatsapp" && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">WhatsApp</span>}
              </span>
              <a href={`https://wa.me/${p.telefono}`} target="_blank" rel="noopener noreferrer" className="text-brand-dark underline">+{p.telefono}</a>
              {p.estado === "inscrito" ? (
                <span className="flex gap-2">
                  <Boton id={p.id} estado="asistio" texto="Llegó" clase="" />
                  <Boton id={p.id} estado="cancelado" texto="Quitar" clase="text-red-800" />
                </span>
              ) : (
                <Boton id={p.id} estado="inscrito" texto="Deshacer" clase="text-tinta-suave" />
              )}
            </li>
          ))}
        </ul>
      )}

      {op.estado !== "cancelado" && (
        <details className="mt-3 rounded-xl bg-crema-claro p-3">
          <summary className="cursor-pointer text-sm font-semibold">＋ Inscribir persona</summary>
          <div className="mt-3">
            <FormularioAgenda accion={inscribirManual} etiqueta="Inscribir" limpiar>
              <input type="hidden" name="operativo_id" value={operativoId} />
              <div className="grid gap-3 sm:grid-cols-[1fr_10rem_6rem]">
                <label className="text-sm">Nombre<input name="nombre" required maxLength={80} className="w-full rounded-xl border bg-white px-3 py-2.5" /></label>
                <label className="text-sm">Teléfono<input name="telefono" required inputMode="tel" placeholder="9 1234 5678" className="w-full rounded-xl border bg-white px-3 py-2.5" /></label>
                <label className="text-sm">Edad<input name="edad" type="number" min={0} max={120} className="w-full rounded-xl border bg-white px-3 py-2.5" /></label>
              </div>
            </FormularioAgenda>
          </div>
        </details>
      )}

      {esAdmin && (
        <details className="mt-2 rounded-xl p-3 text-sm" open={!op.sectores}>
          <summary className="cursor-pointer font-semibold">Sectores que cubre {op.sectores ? `· ${op.sectores}` : ""}</summary>
          <div className="mt-2">
            <FormularioAgenda accion={guardarSectores}>
              <input type="hidden" name="operativo_id" value={operativoId} />
              <label className="block">
                Villas, poblaciones o juntas (ayuda a la IA a reconocer los chats de WhatsApp)
                <input name="sectores" defaultValue={op.sectores ?? ""} maxLength={500} placeholder="Ej: Labrador, Villa Los Aromos, El Rosario" className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5" />
              </label>
            </FormularioAgenda>
          </div>
        </details>
      )}
    </section>
  );
}
