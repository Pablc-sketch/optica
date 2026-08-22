import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";
import EnviarRecetaCorreo from "./enviar-correo";

// Receta óptica imprimible/descargable: lo que se le entrega en mano al
// paciente. Con el logo propio de la óptica y todos los antecedentes de la
// ficha clínica que corresponde que el paciente se lleve (no solo los
// números de la graduación).

function fmtD(v: number | null): string {
  if (v === null) return "—";
  return (v > 0 ? "+" : "") + Number(v).toFixed(2);
}

const TIPOS: Record<string, string> = {
  lejos: "Lejos",
  cerca: "Cerca",
  progresivo: "Progresivo",
};

export default async function RecetaImprimible({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();

  const [pacienteRes, recetaRes, tenantRes] = await Promise.all([
    supabase.from("pacientes").select("*").eq("id", id).single(),
    supabase
      .from("recetas")
      .select("*, profesionales:profesional_id (nombre)")
      .eq("id", recetaId)
      .eq("paciente_id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, telefono, direccion, logo_url").single(),
  ]);

  const paciente = pacienteRes.data;
  const receta = recetaRes.data;
  if (!paciente || !receta) notFound();

  const optica = tenantRes.data;
  const profesional = receta.profesionales as unknown as { nombre: string } | null;

  const edad = paciente.fecha_nacimiento
    ? Math.floor(
        (new Date().getTime() - new Date(paciente.fecha_nacimiento + "T00:00:00").getTime()) /
          (365.25 * 24 * 3600 * 1000)
      )
    : null;

  const alertas = [
    paciente.diabetes && "Diabetes",
    paciente.hipertension && "Hipertensión",
    paciente.glaucoma && "Glaucoma",
    paciente.cirugia_ocular && "Cirugía ocular previa",
    paciente.usa_lentes_contacto && "Usa lentes de contacto",
  ].filter(Boolean) as string[];

  const observaciones = [
    paciente.alergias ? `Alergias: ${paciente.alergias}` : null,
    paciente.medicamentos ? `Medicamentos: ${paciente.medicamentos}` : null,
    paciente.ocupacion ? `Ocupación: ${paciente.ocupacion}` : null,
    paciente.horas_pantalla ? `Horas de pantalla al día: ${paciente.horas_pantalla}` : null,
    paciente.antecedentes_otros,
  ].filter(Boolean) as string[];

  const emailDestino = paciente.email ?? "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-bold">Receta para imprimir</h1>
        <div className="flex flex-wrap items-center gap-2">
          <EnviarRecetaCorreo
            pacienteNombre={paciente.nombre}
            emailDefault={emailDestino}
            urlReceta={`/pacientes/${id}/receta/${recetaId}`}
          />
          <BotonImprimir />
        </div>
      </div>
      <p className="text-xs text-tinta-suave print:hidden">
        &quot;Imprimir&quot; también sirve para guardarla como PDF: en el cuadro que aparece, elegí
        &quot;Guardar como PDF&quot; en vez de una impresora.
      </p>

      <div className="rounded-2xl bg-white p-6 text-neutral-900 shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-neutral-800 pb-4">
          <div className="flex items-center gap-3">
            {optica?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optica.logo_url} alt="" className="h-14 w-14 object-contain" />
            ) : (
              <Image src="/logo.svg" alt="" width={56} height={56} className="rounded-xl" />
            )}
            <div>
              <h2 className="text-lg font-bold">{optica?.nombre_comercial}</h2>
              {(optica?.direccion || optica?.telefono) && (
                <p className="text-xs text-neutral-600">
                  {[optica?.direccion, formatearTelefono(optica?.telefono)].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-wide">Receta óptica</p>
            <p className="text-xs text-neutral-600">{fechaLegible(receta.fecha)}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <p><span className="font-semibold">Paciente:</span> {paciente.nombre}</p>
          <p><span className="font-semibold">RUT:</span> {formatearRut(paciente.rut) || "—"}</p>
          {edad !== null && <p><span className="font-semibold">Edad:</span> {edad} años</p>}
          <p><span className="font-semibold">Tipo de visión:</span> {TIPOS[receta.tipo] ?? receta.tipo}</p>
        </div>

        <table className="mb-1 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-neutral-100 text-left text-xs uppercase">
              <th className="border border-neutral-300 px-2 py-1.5"></th>
              <th className="border border-neutral-300 px-2 py-1.5">Esfera</th>
              <th className="border border-neutral-300 px-2 py-1.5">Cilindro</th>
              <th className="border border-neutral-300 px-2 py-1.5">Eje</th>
              <th className="border border-neutral-300 px-2 py-1.5">Adición</th>
              <th className="border border-neutral-300 px-2 py-1.5">Agudeza visual</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-neutral-300 px-2 py-2 font-bold">OD</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.od_esfera)}</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.od_cilindro)}</td>
              <td className="border border-neutral-300 px-2 py-2">{receta.od_eje !== null ? `${receta.od_eje}°` : "—"}</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.od_add)}</td>
              <td className="border border-neutral-300 px-2 py-2">{receta.av_od ?? "—"}</td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-2 py-2 font-bold">OI</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.oi_esfera)}</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.oi_cilindro)}</td>
              <td className="border border-neutral-300 px-2 py-2">{receta.oi_eje !== null ? `${receta.oi_eje}°` : "—"}</td>
              <td className="border border-neutral-300 px-2 py-2">{fmtD(receta.oi_add)}</td>
              <td className="border border-neutral-300 px-2 py-2">{receta.av_oi ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        <p className="mb-5 text-xs text-neutral-600">
          DP: {receta.dp ?? "—"} mm · Altura: {receta.altura ?? "—"} mm
        </p>

        {(alertas.length > 0 || observaciones.length > 0) && (
          <div className="mb-5 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-600">
              Observaciones
            </p>
            {alertas.length > 0 && <p className="font-medium">{alertas.join(" · ")}</p>}
            {observaciones.map((o, i) => (
              <p key={i} className={alertas.length > 0 || i > 0 ? "mt-1" : ""}>
                {o}
              </p>
            ))}
          </div>
        )}

        {receta.notas && (
          <p className="mb-5 text-sm">
            <span className="font-semibold">Notas de la receta:</span> {receta.notas}
          </p>
        )}

        <div className="mt-10 grid grid-cols-1 gap-8 text-center text-xs text-neutral-500 sm:grid-cols-2 print:mt-16">
          <p className="border-t border-neutral-300 pt-1">
            {profesional?.nombre ?? "Profesional responsable"}
          </p>
          <p className="border-t border-neutral-300 pt-1">Firma y timbre</p>
        </div>
      </div>
    </div>
  );
}
