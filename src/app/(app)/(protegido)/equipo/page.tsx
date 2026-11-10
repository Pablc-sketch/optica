import Link from "next/link";
import CabeceraPagina from "@/components/cabecera-pagina";
import FormularioAgenda from "@/components/formulario-agenda";
import { exigirRolPagina } from "@/lib/autorizacion";
import { guardarEquipo, guardarKit, guardarPersona } from "@/lib/actions/equipo";
import { FUNCIONES } from "@/lib/equipo";

// Personal (no necesita cuenta en Lentia), equipos físicos con su código y
// kits armados con esos equipos. Un equipo puede estar en varios kits: la
// base impide que quede en dos operativos al mismo tiempo.
const campo = "w-full rounded-xl border bg-white px-3 py-2.5 text-base";

type Persona = { id: string; nombre: string; funciones: string[]; telefono: string | null; activo: boolean };
type Equipo = { id: string; nombre: string; tipo: string; codigo: string; activo: boolean };
type Kit = { id: string; nombre: string; activo: boolean; kit_equipos: { equipo_id: string }[] };

function CasillasFunciones({ marcadas = [] }: { marcadas?: string[] }) {
  return (
    <fieldset className="flex flex-wrap gap-3 text-sm">
      <legend className="mb-1 font-medium">Funciones</legend>
      {FUNCIONES.map((f) => (
        <label key={f.valor} className="flex items-center gap-1.5">
          <input type="checkbox" name={`funcion_${f.valor}`} defaultChecked={marcadas.includes(f.valor)} className="size-4" />
          {f.titulo}
        </label>
      ))}
    </fieldset>
  );
}

function Activo({ activo }: { activo: boolean }) {
  return (
    <label className="block text-sm">
      Estado
      <select name="activo" defaultValue={activo ? "on" : "off"} className={campo}>
        <option value="on">Activo</option>
        <option value="off">Inactivo (no se puede asignar)</option>
      </select>
    </label>
  );
}

export default async function Equipo() {
  const { supabase } = await exigirRolPagina(["admin"]);
  const [personasRes, equiposRes, kitsRes] = await Promise.all([
    supabase.from("personal").select("id, nombre, funciones, telefono, activo").order("nombre"),
    supabase.from("equipos").select("id, nombre, tipo, codigo, activo").order("tipo").order("codigo"),
    supabase.from("kits").select("id, nombre, activo, kit_equipos (equipo_id)").order("nombre"),
  ]);
  if (personasRes.error || equiposRes.error || kitsRes.error) throw new Error("No pudimos cargar el equipo");
  const personas = (personasRes.data ?? []) as Persona[];
  const equipos = (equiposRes.data ?? []) as Equipo[];
  const kits = (kitsRes.data ?? []) as Kit[];
  const kitsDeEquipo = (id: string) => kits.filter((k) => k.kit_equipos.some((e) => e.equipo_id === id)).map((k) => k.nombre);

  return (
    <div className="space-y-6">
      <CabeceraPagina seccion="Operativos" titulo="Personal y equipos" />
      <Link href="/operativos/organizar" className="inline-block rounded-xl bg-brand px-4 py-2.5 font-semibold text-white">
        ＋ Organizar operativo
      </Link>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Personal <span className="text-sm font-normal text-tinta-suave">· {personas.length}</span></h2>
        <details className="rounded-xl bg-crema-claro p-3">
          <summary className="cursor-pointer font-semibold">＋ Agregar persona</summary>
          <div className="mt-3">
            <FormularioAgenda accion={guardarPersona} limpiar etiqueta="Agregar">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">Nombre<input required name="nombre" maxLength={100} className={campo} /></label>
                <label className="text-sm font-medium">Teléfono<input name="telefono" maxLength={30} placeholder="Opcional" className={campo} /></label>
              </div>
              <CasillasFunciones />
            </FormularioAgenda>
          </div>
        </details>
        {personas.length === 0 && <p className="text-sm text-tinta-suave">Sin personas registradas.</p>}
        <ul className="divide-y divide-tinta/10">
          {personas.map((p) => (
            <li key={p.id} className="py-2">
              <details>
                <summary className={`cursor-pointer font-semibold ${p.activo ? "" : "text-tinta-suave line-through"}`}>
                  {p.nombre}{" "}
                  <span className="text-sm font-normal text-tinta-suave">
                    · {p.funciones.map((f) => FUNCIONES.find((x) => x.valor === f)?.titulo ?? f).join(", ")}
                  </span>
                </summary>
                <div className="mt-2">
                  <FormularioAgenda accion={guardarPersona}>
                    <input type="hidden" name="id" value={p.id} />
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="text-sm">Nombre<input required name="nombre" defaultValue={p.nombre} maxLength={100} className={campo} /></label>
                      <label className="text-sm">Teléfono<input name="telefono" defaultValue={p.telefono ?? ""} maxLength={30} className={campo} /></label>
                      <Activo activo={p.activo} />
                    </div>
                    <CasillasFunciones marcadas={p.funciones} />
                  </FormularioAgenda>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Equipos <span className="text-sm font-normal text-tinta-suave">· {equipos.length}</span></h2>
        <details className="rounded-xl bg-crema-claro p-3">
          <summary className="cursor-pointer font-semibold">＋ Agregar equipo</summary>
          <div className="mt-3">
            <FormularioAgenda accion={guardarEquipo} limpiar etiqueta="Agregar">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-sm font-medium">Nombre<input required name="nombre" maxLength={100} placeholder="Autorefractómetro 1" className={campo} /></label>
                <label className="text-sm font-medium">Tipo<input required name="tipo" maxLength={60} placeholder="autorefractómetro, lensómetro, maleta…" className={campo} /></label>
                <label className="text-sm font-medium">Código o serie<input required name="codigo" maxLength={60} placeholder="AR-001" className={campo} /></label>
              </div>
            </FormularioAgenda>
          </div>
        </details>
        {equipos.length === 0 && <p className="text-sm text-tinta-suave">Sin equipos registrados.</p>}
        <ul className="divide-y divide-tinta/10">
          {equipos.map((e) => (
            <li key={e.id} className="py-2">
              <details>
                <summary className={`cursor-pointer font-semibold ${e.activo ? "" : "text-tinta-suave line-through"}`}>
                  {e.nombre} <span className="font-mono text-sm">{e.codigo}</span>{" "}
                  <span className="text-sm font-normal text-tinta-suave">
                    · {e.tipo}{kitsDeEquipo(e.id).length > 0 && ` · en ${kitsDeEquipo(e.id).join(", ")}`}
                  </span>
                </summary>
                <div className="mt-2">
                  <FormularioAgenda accion={guardarEquipo}>
                    <input type="hidden" name="id" value={e.id} />
                    <div className="grid gap-3 sm:grid-cols-4">
                      <label className="text-sm">Nombre<input required name="nombre" defaultValue={e.nombre} maxLength={100} className={campo} /></label>
                      <label className="text-sm">Tipo<input required name="tipo" defaultValue={e.tipo} maxLength={60} className={campo} /></label>
                      <label className="text-sm">Código<input required name="codigo" defaultValue={e.codigo} maxLength={60} className={campo} /></label>
                      <Activo activo={e.activo} />
                    </div>
                  </FormularioAgenda>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold">Kits <span className="text-sm font-normal text-tinta-suave">· {kits.length}</span></h2>
        <p className="text-sm text-tinta-suave">Un equipo puede estar en varios kits; no puede estar en dos operativos al mismo tiempo.</p>
        {[{ id: "", nombre: "", activo: true, kit_equipos: [] } as Kit, ...kits].map((k) => (
          <details key={k.id || "nuevo"} className={k.id ? "border-t border-tinta/10 pt-2" : "rounded-xl bg-crema-claro p-3"}>
            <summary className="cursor-pointer font-semibold">
              {k.id ? (
                <>
                  {k.nombre}{" "}
                  <span className="text-sm font-normal text-tinta-suave">
                    · {k.kit_equipos.length} equipo{k.kit_equipos.length === 1 ? "" : "s"}{k.activo ? "" : " · inactivo"}
                  </span>
                </>
              ) : (
                "＋ Armar kit"
              )}
            </summary>
            <div className="mt-3">
              <FormularioAgenda accion={guardarKit} limpiar={!k.id} etiqueta={k.id ? "Guardar" : "Crear kit"}>
                {k.id && <input type="hidden" name="id" value={k.id} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">Nombre<input required name="nombre" defaultValue={k.nombre} maxLength={100} className={campo} /></label>
                  {k.id && <Activo activo={k.activo} />}
                </div>
                <fieldset className="grid gap-1.5 text-sm sm:grid-cols-2">
                  <legend className="mb-1 font-medium">Equipos del kit</legend>
                  {equipos.filter((e) => e.activo || k.kit_equipos.some((x) => x.equipo_id === e.id)).map((e) => (
                    <label key={e.id} className="flex items-center gap-2">
                      <input type="checkbox" name="equipo" value={e.id} defaultChecked={k.kit_equipos.some((x) => x.equipo_id === e.id)} className="size-4" />
                      {e.nombre} <span className="font-mono text-xs">{e.codigo}</span>
                    </label>
                  ))}
                  {equipos.length === 0 && <p className="text-tinta-suave">Primero agrega equipos.</p>}
                </fieldset>
              </FormularioAgenda>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
