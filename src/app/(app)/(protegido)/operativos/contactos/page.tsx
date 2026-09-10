import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { clp } from "@/lib/clp";
import { fechaLegible, haceCuanto, hoyEnChile, sumarMeses } from "@/lib/fechas";
import ContactosOperativo, { type ContactoOperativo } from "../contactos-operativo";

// Agenda de dirigentes: la libreta de "a quién hay que llamar para volver
// a ese lugar".
//
// Un operativo bueno no se repite solo: seis meses después nadie se
// acuerda de cómo se llamaba el presidente del condominio ni por qué
// número se le escribió. Acá cada lugar aparece con su gente, su
// dirección, cuándo fue la última vez, cómo le fue y si ya toca volver a
// llamar — que es justo la información que uno querría tener a mano antes
// de escribir ese mensaje.

const TIPOS_VENUE: Record<string, string> = {
  condominio: "Condominio",
  junta_vecinos: "Junta de vecinos",
  apr: "APR",
  colegio: "Colegio",
  sala_cuna: "Sala cuna",
  supermercado: "Supermercado",
  otro: "Otro",
};

export default async function AgendaContactos() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const perfilRes = await supabase.from("users").select("rol").eq("id", user!.id).single();
  if (perfilRes.data?.rol !== "admin") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold">Agenda de dirigentes</h1>
        <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">
          Solo el administrador de la óptica ve los contactos de los operativos.
        </p>
      </div>
    );
  }

  const [{ data: operativos }, { data: contactos }, { data: recetas }, { data: ventas }] =
    await Promise.all([
      supabase
        .from("operativos")
        .select(
          "id, nombre, fecha, fecha_fin, direccion, tipo_venue, estado, notas, volver_en_meses"
        )
        .neq("estado", "cancelado")
        .order("fecha", { ascending: false }),
      supabase
        .from("contactos_operativo")
        .select("id, operativo_id, nombre, cargo, telefono, email, notas")
        .order("created_at", { ascending: true }),
      supabase.from("recetas").select("operativo_id, paciente_id").not("operativo_id", "is", null),
      supabase
        .from("ventas")
        .select("operativo_id, total")
        .eq("anulada", false)
        .not("operativo_id", "is", null),
    ]);

  const contactosPorOperativo = new Map<string, ContactoOperativo[]>();
  for (const c of contactos ?? []) {
    if (!contactosPorOperativo.has(c.operativo_id)) contactosPorOperativo.set(c.operativo_id, []);
    contactosPorOperativo.get(c.operativo_id)!.push(c);
  }
  // Gente atendida por persona, no por receta: es el número que sirve para
  // convencer al dirigente de que vale la pena repetir.
  const examinadosPorOperativo = new Map<string, Set<string>>();
  for (const r of recetas ?? []) {
    if (!r.operativo_id || !r.paciente_id) continue;
    if (!examinadosPorOperativo.has(r.operativo_id)) examinadosPorOperativo.set(r.operativo_id, new Set());
    examinadosPorOperativo.get(r.operativo_id)!.add(r.paciente_id);
  }
  const vendidoPorOperativo = new Map<string, number>();
  for (const v of ventas ?? []) {
    if (!v.operativo_id) continue;
    vendidoPorOperativo.set(v.operativo_id, (vendidoPorOperativo.get(v.operativo_id) ?? 0) + v.total);
  }

  const hoy = hoyEnChile();
  const lugares = (operativos ?? []).map((o) => {
    // El plazo se cuenta desde que terminó el operativo, no desde que
    // empezó: si duró un fin de semana, "hace seis meses" se mide desde el
    // domingo.
    const ultimoDia = o.fecha_fin && o.fecha_fin > o.fecha ? o.fecha_fin : o.fecha;
    const tocaVolver = sumarMeses(ultimoDia, o.volver_en_meses);
    return {
      ...o,
      ultimoDia,
      tocaVolver,
      yaToca: tocaVolver <= hoy,
      // Un operativo que todavía no pasa no puede "tocar volver": recién
      // se está haciendo.
      futuro: ultimoDia > hoy,
      contactos: contactosPorOperativo.get(o.id) ?? [],
      examinados: examinadosPorOperativo.get(o.id)?.size ?? 0,
      vendido: vendidoPorOperativo.get(o.id) ?? 0,
    };
  });

  // Primero los que ya toca llamar, y dentro de esos el que lleva más
  // tiempo esperando: es el orden en que uno se sentaría a escribir.
  const pendientes = lugares
    .filter((l) => !l.futuro && l.yaToca)
    .sort((a, b) => a.tocaVolver.localeCompare(b.tocaVolver));
  const resto = lugares.filter((l) => l.futuro || !l.yaToca);
  const sinContacto = lugares.filter((l) => l.contactos.length === 0).length;

  const Ficha = ({ l }: { l: (typeof lugares)[number] }) => (
    <li className="rounded-2xl border border-sky-100 bg-sky-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link href={`/operativos/${l.id}`} className="font-semibold text-sky-950 hover:underline">
            {l.nombre}
          </Link>
          <p className="text-sm text-sky-800">
            {[l.tipo_venue ? TIPOS_VENUE[l.tipo_venue] ?? l.tipo_venue : null, l.direccion]
              .filter(Boolean)
              .join(" · ") || "Sin dirección cargada"}
          </p>
          <p className="text-xs text-sky-700">
            Último operativo: {fechaLegible(l.ultimoDia)} ({haceCuanto(l.ultimoDia, hoy)})
            {l.examinados > 0 && ` · ${l.examinados} atendidos`}
            {l.vendido > 0 && ` · ${clp(l.vendido)} vendidos`}
          </p>
        </div>
        {l.futuro ? (
          <span className="rounded-full bg-sky-200 px-2 py-0.5 text-xs font-semibold text-sky-900">
            todavía no pasa
          </span>
        ) : l.yaToca ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            toca volver (desde {fechaLegible(l.tocaVolver)})
          </span>
        ) : (
          <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-sky-800">
            volver a partir de {fechaLegible(l.tocaVolver)}
          </span>
        )}
      </div>

      {l.notas && <p className="mt-2 text-xs text-sky-800">{l.notas}</p>}

      <div className="mt-3">
        <ContactosOperativo
          operativoId={l.id}
          contactos={l.contactos}
          volverEnMeses={l.volver_en_meses}
        />
      </div>
    </li>
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/operativos" className="text-xs font-medium text-sky-700 hover:underline">
          ← Todos los operativos
        </Link>
        <h1 className="mt-1 text-xl font-bold">Agenda de dirigentes</h1>
        <p className="text-sm text-tinta-suave">
          Con quién hay que hablar para volver a cada lugar, y cuándo toca hacerlo.
        </p>
      </div>

      {lugares.length === 0 ? (
        <p className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800">
          Todavía no hay operativos con contactos que guardar.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-sky-50 p-3">
              <p className="text-xs text-sky-800">Lugares en la agenda</p>
              <p className="text-xl font-bold text-sky-950">{lugares.length}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-3">
              <p className="text-xs text-sky-800">Ya toca volver</p>
              <p className="text-xl font-bold text-sky-950">{pendientes.length}</p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-3">
              <p className="text-xs text-sky-800">Sin dirigente anotado</p>
              <p className="text-xl font-bold text-sky-950">{sinContacto}</p>
              <p className="text-xs text-sky-700">no hay a quién llamar</p>
            </div>
          </div>

          {pendientes.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">Toca volver a llamar</h2>
              <ul className="flex flex-col gap-3">
                {pendientes.map((l) => (
                  <Ficha key={l.id} l={l} />
                ))}
              </ul>
            </section>
          )}

          {resto.length > 0 && (
            <section>
              <h2 className="mb-2 font-semibold">
                {pendientes.length > 0 ? "El resto de los lugares" : "Todos los lugares"}
              </h2>
              <ul className="flex flex-col gap-3">
                {resto.map((l) => (
                  <Ficha key={l.id} l={l} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
