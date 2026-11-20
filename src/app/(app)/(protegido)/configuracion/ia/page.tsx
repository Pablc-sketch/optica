import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import { exigirRolPagina } from "@/lib/autorizacion";
import { agregarNotaIA, borrarNotaIA } from "@/lib/actions/asistente";
import { ETIQUETAS } from "@/lib/cambios-operativo";

// Lo que la IA sabe de esta óptica. No se re-entrena el modelo: cada vez
// que la IA trabaja lee estas notas, y suma solas las que aprende cuando
// confirmas una inscripción de WhatsApp. Son solo de esta óptica.

type Nota = { id: string; texto: string; origen: string; creado_en: string };
type Cambio = { id: number; operativo_id: string; antes: Record<string, unknown>; despues: Record<string, unknown>; creado_en: string };

export default async function ConocimientoIA() {
  const { supabase, tenantId } = await exigirRolPagina(["admin"]);
  const [notasRes, cambiosRes] = await Promise.all([
    supabase.from("ia_conocimiento").select("id, texto, origen, creado_en").eq("tenant_id", tenantId).order("creado_en", { ascending: false }).limit(200),
    supabase.from("asistente_cambios").select("id, operativo_id, antes, despues, creado_en").eq("tenant_id", tenantId).order("creado_en", { ascending: false }).limit(20),
  ]);
  if (notasRes.error) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">Esta función aún no está activada en la base de datos.</p>;
  const notas = (notasRes.data ?? []) as Nota[];
  const cambios = (cambiosRes.data ?? []) as Cambio[];
  const nombresRes = cambios.length
    ? await supabase.from("operativos").select("id, nombre").eq("tenant_id", tenantId).in("id", [...new Set(cambios.map((c) => c.operativo_id))])
    : { data: [] as { id: string; nombre: string }[] };
  const nombres = new Map((nombresRes.data ?? []).map((o) => [o.id, o.nombre]));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/configuracion" className="text-sm underline">← Configuración</Link>
      <CabeceraPagina seccion="Configuración" titulo="Lo que sabe la IA" />
      <p className="text-sm text-tinta-suave">
        La IA usa estas notas cada vez que responde o lee un chat. Aprende sola cuando confirmas a alguien de WhatsApp
        (ej. «Labrador corresponde a Talagante»), y puedes enseñarle cosas aquí o diciéndole «recuerda que…» en el asistente.
        Son solo de tu óptica.
      </p>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <FormularioAgenda accion={agregarNotaIA} etiqueta="Enseñar" limpiar>
          <label className="block text-sm font-medium">
            Nueva nota
            <input name="texto" required maxLength={300} placeholder="Ej: El Monte y Lo Chacón son sectores de Talagante" className="mt-1 w-full rounded-xl border px-3 py-2.5" />
          </label>
        </FormularioAgenda>
        <ul className="mt-4 divide-y divide-tinta/10 text-sm">
          {notas.length === 0 && <li className="py-2 text-tinta-suave">Todavía no hay notas.</li>}
          {notas.map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-2">
              <span className="min-w-0 flex-1">
                {n.texto}
                {n.origen === "aprendido" && <span className="ml-2 rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-900">aprendida</span>}
              </span>
              <form action={async (d) => { "use server"; await borrarNotaIA(d); }}>
                <input type="hidden" name="id" value={n.id} />
                <button className="text-xs text-red-800 underline">Borrar</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {cambios.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">Últimos cambios hechos con el asistente</h2>
          <ul className="mt-2 divide-y divide-tinta/10 text-sm">
            {cambios.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/operativos/${c.operativo_id}`} className="font-semibold underline">{nombres.get(c.operativo_id) ?? "Operativo"}</Link>
                <span className="text-xs text-tinta-suave"> · {new Date(c.creado_en).toLocaleString("es-CL", { timeZone: "America/Santiago" })}</span>
                <ul className="text-xs">
                  {Object.entries(c.despues).filter(([k]) => k !== "region").map(([k, v]) => (
                    <li key={k}>{ETIQUETAS[k] ?? k}: <s className="opacity-60">{String(c.antes[k] ?? "(vacío)")}</s> → {String(v ?? "(vacío)")}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
