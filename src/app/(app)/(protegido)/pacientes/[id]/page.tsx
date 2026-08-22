import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { actualizarFichaClinica, crearReceta } from "@/lib/actions/pacientes";
import { formatearRut } from "@/lib/rut";
import { CampoAgudezaVisual, CampoDioptria } from "@/components/campos";
import EliminarPaciente from "../eliminar-paciente";

function fmtDioptria(v: number | null): string {
  if (v === null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

// Campo óptico numérico simple (eje en grados, DP, altura): sin signo, solo
// teclado decimal para cargar rápido.
function CampoOptico({ name, label, placeholder }: { name: string; label: string; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium">
      {label}
      <input
        name={name}
        inputMode="decimal"
        placeholder={placeholder ?? "0.00"}
        className="w-full rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand"
      />
    </label>
  );
}

export default async function FichaPaciente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: paciente } = await supabase
    .from("pacientes")
    .select("*")
    .eq("id", id)
    .single();
  if (!paciente) notFound();

  const alertas = [
    paciente.diabetes && "Diabetes",
    paciente.hipertension && "Hipertensión",
    paciente.glaucoma && "Glaucoma",
    paciente.cirugia_ocular && "Cirugía ocular previa",
    paciente.usa_lentes_contacto && "Usa lentes de contacto",
  ].filter(Boolean) as string[];

  const edad = paciente.fecha_nacimiento
    ? Math.floor(
        (new Date().getTime() - new Date(paciente.fecha_nacimiento + "T00:00:00").getTime()) /
          (365.25 * 24 * 3600 * 1000)
      )
    : null;

  const { data: recetas } = await supabase
    .from("recetas")
    .select("*")
    .eq("paciente_id", id)
    .order("fecha", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{paciente.nombre}</h1>
          <p className="text-sm text-tinta-suave">
            {[
              formatearRut(paciente.rut) || null,
              edad !== null ? `${edad} años` : null,
              paciente.telefono,
              paciente.email,
            ]
              .filter(Boolean)
              .join(" · ") || "Sin datos de contacto"}
          </p>
        </div>
        <EliminarPaciente pacienteId={paciente.id} nombre={paciente.nombre} irALista />
      </div>
      {alertas.length > 0 && (
        <div className="-mt-4 flex flex-wrap gap-1.5">
          {alertas.map((a) => (
            <span key={a} className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              ⚠ {a}
            </span>
          ))}
        </div>
      )}

      <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-brand-dark">
          Ficha clínica y antecedentes
        </summary>
        <form action={actualizarFichaClinica} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="paciente_id" value={paciente.id} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { name: "diabetes", label: "Diabetes", checked: paciente.diabetes },
              { name: "hipertension", label: "Hipertensión", checked: paciente.hipertension },
              { name: "glaucoma", label: "Glaucoma", checked: paciente.glaucoma },
              { name: "cirugia_ocular", label: "Cirugía ocular", checked: paciente.cirugia_ocular },
              { name: "usa_lentes_contacto", label: "Lentes de contacto", checked: paciente.usa_lentes_contacto },
            ].map((c) => (
              <label
                key={c.name}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-tinta-suave/25 bg-white px-3 py-2 text-sm has-checked:border-brand has-checked:bg-brand/10"
              >
                <input type="checkbox" name={c.name} defaultChecked={c.checked} className="accent-brand" />
                {c.label}
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Alergias
              <input name="alergias" defaultValue={paciente.alergias ?? ""} placeholder="Níquel, látex…" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Medicamentos
              <input name="medicamentos" defaultValue={paciente.medicamentos ?? ""} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Ocupación
              <input name="ocupacion" defaultValue={paciente.ocupacion ?? ""} placeholder="Profesor, conductor…" className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Horas de pantalla al día
              <select name="horas_pantalla" defaultValue={paciente.horas_pantalla ?? ""} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2.5 text-base outline-none focus:border-brand">
                <option value="">—</option>
                <option value="menos de 2">Menos de 2</option>
                <option value="2 a 4">2 a 4</option>
                <option value="4 a 8">4 a 8</option>
                <option value="mas de 8">Más de 8</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Otros antecedentes
            <textarea name="antecedentes_otros" rows={2} defaultValue={paciente.antecedentes_otros ?? ""} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand" />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Observaciones
            <textarea name="notas" rows={2} defaultValue={paciente.notas ?? ""} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand" />
          </label>

          <div className="flex items-center gap-3">
            <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
              Guardar ficha
            </button>
            {paciente.ultima_visita && (
              <span className="text-xs text-tinta-suave">
                Última visita: {new Date(paciente.ultima_visita + "T00:00:00").toLocaleDateString("es-CL")}
              </span>
            )}
          </div>
        </form>
      </details>

      <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva receta</summary>
        <form action={crearReceta} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="paciente_id" value={paciente.id} />

          <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
            <legend className="px-1 text-sm font-bold">OD (ojo derecho)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Esfera
                <CampoDioptria name="od_esfera" signo="libre" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">
                Cilindro
                <CampoDioptria name="od_cilindro" signo="-" />
              </label>
              <CampoOptico name="od_eje" label="Eje °" placeholder="180" />
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
            <legend className="px-1 text-sm font-bold">OI (ojo izquierdo)</legend>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium">
                Esfera
                <CampoDioptria name="oi_esfera" signo="libre" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium">
                Cilindro
                <CampoDioptria name="oi_cilindro" signo="-" />
              </label>
              <CampoOptico name="oi_eje" label="Eje °" placeholder="175" />
            </div>
          </fieldset>

          {/* La adición casi siempre es la misma para los dos ojos: un solo
              campo que se aplica a toda la receta, no dos que casi siempre
              terminan repitiendo el mismo número. */}
          <label className="flex w-32 flex-col gap-1 text-xs font-medium">
            Adición (ADD)
            <CampoDioptria name="add" signo="+" />
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <CampoOptico name="dp" label="DP (mm)" placeholder="63" />
            <CampoOptico name="altura" label="Altura (mm)" placeholder="20" />
            <label className="flex flex-col gap-1 text-xs font-medium">
              AV OD
              <CampoAgudezaVisual name="av_od" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              AV OI
              <CampoAgudezaVisual name="av_oi" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              Tipo
              <select name="tipo" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-base outline-none focus:border-brand">
                <option value="lejos">Lejos</option>
                <option value="cerca">Cerca</option>
                <option value="progresivo">Progresivo</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Notas
            <textarea name="notas" rows={2} className="rounded-lg border border-tinta-suave/30 bg-white px-3 py-2 text-base outline-none focus:border-brand" />
          </label>

          <div>
            <button className="rounded-lg bg-brand px-4 py-2.5 font-semibold text-white hover:bg-brand-dark">
              Guardar receta
            </button>
          </div>
        </form>
      </details>

      <section>
        <h2 className="mb-3 font-semibold">Historial de recetas</h2>
        {!recetas || recetas.length === 0 ? (
          <p className="rounded-2xl bg-crema-claro p-4 text-sm text-tinta-suave">Sin recetas registradas.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recetas.map((r) => (
              <li key={r.id} className="rounded-2xl bg-crema-claro p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-semibold">{new Date(r.fecha + "T00:00:00").toLocaleDateString("es-CL")}</span>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-crema px-2.5 py-0.5 text-xs font-medium capitalize text-tinta-suave">{r.tipo}</span>
                    <Link
                      href={`/pacientes/${paciente.id}/receta/${r.id}`}
                      className="rounded-lg border border-tinta-suave/30 px-2 py-1 text-xs font-medium text-brand-dark transition hover:bg-white"
                    >
                      🖨 Ver / Imprimir
                    </Link>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-105 text-sm">
                    <thead>
                      <tr className="text-left text-xs text-tinta-suave">
                        <th className="py-1 pr-3"></th>
                        <th className="py-1 pr-3">Esfera</th>
                        <th className="py-1 pr-3">Cilindro</th>
                        <th className="py-1 pr-3">Eje</th>
                        <th className="py-1 pr-3">ADD</th>
                        <th className="py-1">AV</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1 pr-3 font-bold">OD</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.od_esfera)}</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.od_cilindro)}</td>
                        <td className="py-1 pr-3">{r.od_eje ?? "—"}°</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.od_add)}</td>
                        <td className="py-1">{r.av_od ?? "—"}</td>
                      </tr>
                      <tr>
                        <td className="py-1 pr-3 font-bold">OI</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.oi_esfera)}</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.oi_cilindro)}</td>
                        <td className="py-1 pr-3">{r.oi_eje ?? "—"}°</td>
                        <td className="py-1 pr-3">{fmtDioptria(r.oi_add)}</td>
                        <td className="py-1">{r.av_oi ?? "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-tinta-suave">
                  DP {r.dp ?? "—"} mm · Altura {r.altura ?? "—"} mm{r.notas ? ` · ${r.notas}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
