import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { crearReceta } from "@/lib/actions/pacientes";

function fmtDioptria(v: number | null): string {
  if (v === null) return "—";
  return (v > 0 ? "+" : "") + v.toFixed(2);
}

// Campo óptico: teclado decimal automático (spec 8.3 — velocidad de carga).
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
    .select("id, nombre, rut, telefono, email, fecha_nacimiento, notas")
    .eq("id", id)
    .single();
  if (!paciente) notFound();

  const { data: recetas } = await supabase
    .from("recetas")
    .select("*")
    .eq("paciente_id", id)
    .order("fecha", { ascending: false });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{paciente.nombre}</h1>
        <p className="text-sm text-tinta-suave">
          {[paciente.rut, paciente.telefono, paciente.email].filter(Boolean).join(" · ") || "Sin datos de contacto"}
        </p>
      </div>

      <details className="rounded-2xl bg-crema-claro p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-brand-dark">＋ Nueva receta</summary>
        <form action={crearReceta} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="paciente_id" value={paciente.id} />

          <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
            <legend className="px-1 text-sm font-bold">OD (ojo derecho)</legend>
            <div className="grid grid-cols-4 gap-2">
              <CampoOptico name="od_esfera" label="Esfera" placeholder="-1.25" />
              <CampoOptico name="od_cilindro" label="Cilindro" placeholder="-0.50" />
              <CampoOptico name="od_eje" label="Eje °" placeholder="180" />
              <CampoOptico name="od_add" label="ADD" placeholder="+1.50" />
            </div>
          </fieldset>

          <fieldset className="rounded-xl border border-tinta-suave/20 p-3">
            <legend className="px-1 text-sm font-bold">OI (ojo izquierdo)</legend>
            <div className="grid grid-cols-4 gap-2">
              <CampoOptico name="oi_esfera" label="Esfera" placeholder="-1.00" />
              <CampoOptico name="oi_cilindro" label="Cilindro" placeholder="-0.25" />
              <CampoOptico name="oi_eje" label="Eje °" placeholder="175" />
              <CampoOptico name="oi_add" label="ADD" placeholder="+1.50" />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <CampoOptico name="dp" label="DP (mm)" placeholder="63" />
            <CampoOptico name="altura" label="Altura (mm)" placeholder="20" />
            <label className="flex flex-col gap-1 text-xs font-medium">
              AV OD
              <input name="av_od" placeholder="20/20" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              AV OI
              <input name="av_oi" placeholder="20/20" className="rounded-lg border border-tinta-suave/30 bg-white px-2 py-2 text-center text-base outline-none focus:border-brand" />
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
                  <span className="rounded-full bg-crema px-2.5 py-0.5 text-xs font-medium capitalize text-tinta-suave">{r.tipo}</span>
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
