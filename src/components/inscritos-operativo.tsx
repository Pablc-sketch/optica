import FormularioAgenda from "@/components/formulario-agenda";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cambiarInscrito, guardarSectores, inscribirManual } from "@/lib/actions/whatsapp";

// Personas inscritas en un operativo (desde la bandeja de WhatsApp o a
// mano), y los sectores que cubre, que la IA usa para reconocer a quién
// corresponde cada chat.

type Inscrito = { id: string; nombre: string; telefono: string; edad: number | null; estado: string; llego: boolean; origen: string; sector: string | null; motivo: string | null };

function Boton({ id, accion, texto, clase }: { id: string; accion: string; texto: string; clase: string }) {
  return (
    <form action={async (d) => { "use server"; await cambiarInscrito(d); }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="accion" value={accion} />
      <button className={`rounded-lg border px-2 py-1 text-xs font-semibold ${clase}`}>{texto}</button>
    </form>
  );
}

export default async function InscritosOperativo({ operativoId }: { operativoId: string }) {
  const supabase = await createClient();
  const [opRes, inscritosRes, rolRes, sugRes] = await Promise.all([
    supabase.from("operativos").select("sectores, meta_examenes, estado").eq("id", operativoId).maybeSingle(),
    supabase.from("inscritos_operativo").select("id, nombre, telefono, edad, estado, llego, origen, sector, motivo").eq("operativo_id", operativoId)
      .eq("estado", "inscrito").order("creado_en"),
    supabase.rpc("jwt_rol"),
    supabase.from("whatsapp_sugerencias").select("id", { count: "exact", head: true }).eq("operativo_id", operativoId).eq("estado", "pendiente"),
  ]);
  // Si la migración aún no está aplicada, la sección no aparece.
  if (opRes.error || !opRes.data || inscritosRes.error) return null;
  const op = opRes.data;
  const inscritos = (inscritosRes.data ?? []) as Inscrito[];
  const esAdmin = rolRes.data === "admin";
  // Los inscritos los ve quien atiende el operativo: administrador y ventas.
  if (!esAdmin && rolRes.data !== "ventas") return null;
  // Solo entran a esta lista las inscripciones aprobadas.
  const vigentes = inscritos.length;
  const pendientesWhatsapp = sugRes.count ?? 0;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold">Inscritos · lista para llamar</h2>
        <span className="text-sm text-tinta-suave">
          {vigentes}{op.meta_examenes ? ` de ${op.meta_examenes} (meta)` : ""} · {inscritos.filter((i) => i.llego).length} llegaron
        </span>
      </div>

      {pendientesWhatsapp > 0 && esAdmin && (
        <Link href="/whatsapp" className="mt-3 block rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-950 underline">
          {pendientesWhatsapp} inscripción{pendientesWhatsapp === 1 ? "" : "es"} de WhatsApp por confirmar para este operativo →
        </Link>
      )}

      {vigentes === 0 ? (
        <p className="mt-2 text-sm text-tinta-suave">Todavía no hay personas inscritas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-tinta/10 text-sm">
          {inscritos.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className={`min-w-0 flex-1 font-medium ${p.llego ? "text-emerald-800" : ""}`}>
                {p.nombre}{p.edad !== null ? `, ${p.edad} años` : ""}
                {p.origen === "whatsapp" && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-900">WhatsApp</span>}
              </span>
              <a href={`tel:+${p.telefono}`} className="text-brand-dark underline">+{p.telefono}</a>
              {p.llego ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-800">Llegó</span>
                  <Boton id={p.id} accion="no_llego" texto="Deshacer" clase="text-tinta-suave" />
                </span>
              ) : (
                <span className="flex gap-2">
                  <Boton id={p.id} accion="llego" texto="Llegó" clase="" />
                  <Boton id={p.id} accion="quitar" texto="Quitar" clase="text-red-800" />
                </span>
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
