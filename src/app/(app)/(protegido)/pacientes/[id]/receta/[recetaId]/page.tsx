import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatearRut } from "@/lib/rut";
import { formatearTelefono } from "@/lib/formato";
import { fechaLegible } from "@/lib/fechas";
import BotonImprimir from "@/components/boton-imprimir";
import EnviarRecetaCorreo from "./enviar-correo";
import DescargarPdf from "./descargar-pdf";
import type { DatosRecetaImpresion } from "@/lib/receta-datos";
import { nombreCristal } from "@/lib/cristales";

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
  lejos_y_cerca: "Lejos y cerca",
};

export default async function RecetaImprimible({
  params,
}: {
  params: Promise<{ id: string; recetaId: string }>;
}) {
  const { id, recetaId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [pacienteRes, recetaRes, tenantRes, profesionalRes] = await Promise.all([
    supabase.from("pacientes").select("*").eq("id", id).single(),
    supabase
      .from("recetas")
      .select("*")
      .eq("id", recetaId)
      .eq("paciente_id", id)
      .single(),
    supabase.from("tenants").select("nombre_comercial, telefono, direccion, logo_url").single(),
    // Timbre del profesional: siempre el de quien tiene la sesión abierta al
    // imprimir/enviar, mismo criterio que la orden de trabajo.
    supabase
      .from("users")
      .select("nombre, rut, titulo_profesional, registro_profesional")
      .eq("id", user!.id)
      .single(),
  ]);

  const paciente = pacienteRes.data;
  const receta = recetaRes.data;
  if (!paciente || !receta) notFound();

  const optica = tenantRes.data;
  const profesional = profesionalRes.data;

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

  // El lente sugerido se suma a los antecedentes de siempre — la
  // observación de venta (nota interna tecnólogo → vendedora) no va acá,
  // esta es la receta que se lleva el paciente.
  const observaciones = [
    paciente.alergias ? `Alergias: ${paciente.alergias}` : null,
    paciente.medicamentos ? `Medicamentos: ${paciente.medicamentos}` : null,
    paciente.ocupacion ? `Ocupación: ${paciente.ocupacion}` : null,
    paciente.horas_pantalla ? `Horas de pantalla al día: ${paciente.horas_pantalla}` : null,
    paciente.antecedentes_otros,
    paciente.notas,
    receta.sugerencia_tipo_lente && receta.sugerencia_tratamiento
      ? `Lente sugerido${receta.tipo === "lejos_y_cerca" ? " (lejos)" : ""}: ${nombreCristal(receta.sugerencia_tipo_lente, receta.sugerencia_tratamiento)}`
      : null,
    receta.sugerencia_tipo_lente_cerca && receta.sugerencia_tratamiento_cerca
      ? `Lente sugerido (cerca): ${nombreCristal(receta.sugerencia_tipo_lente_cerca, receta.sugerencia_tratamiento_cerca)}`
      : null,
  ].filter(Boolean) as string[];

  const emailDestino = paciente.email ?? "";

  const tipoVisionTexto = TIPOS[receta.tipo] ?? receta.tipo;
  const addTexto =
    receta.od_add === receta.oi_add ? fmtD(receta.od_add) : `OD ${fmtD(receta.od_add)} · OI ${fmtD(receta.oi_add)}`;

  const datosPdf: DatosRecetaImpresion = {
    opticaNombre: optica?.nombre_comercial ?? "",
    opticaDireccion: optica?.direccion ?? null,
    opticaTelefono: optica?.telefono ? formatearTelefono(optica.telefono) : null,
    logoUrl: optica?.logo_url ?? null,
    pacienteNombre: paciente.nombre,
    rut: formatearRut(paciente.rut) || "—",
    edad,
    tipoVision: tipoVisionTexto,
    fecha: fechaLegible(receta.fecha),
    od: {
      esfera: fmtD(receta.od_esfera),
      cilindro: fmtD(receta.od_cilindro),
      eje: receta.od_eje !== null ? `${receta.od_eje}°` : "—",
      av: receta.av_od ?? "—",
    },
    oi: {
      esfera: fmtD(receta.oi_esfera),
      cilindro: fmtD(receta.oi_cilindro),
      eje: receta.oi_eje !== null ? `${receta.oi_eje}°` : "—",
      av: receta.av_oi ?? "—",
    },
    dp: receta.dp !== null ? String(receta.dp) : "—",
    altura: receta.altura !== null ? String(receta.altura) : "—",
    add: addTexto,
    alertas,
    observaciones,
    notas: receta.notas,
    profesional: profesional?.titulo_profesional
      ? {
          nombre: profesional.nombre,
          rut: profesional.rut ? formatearRut(profesional.rut) : null,
          tituloProfesional: profesional.titulo_profesional,
          registroProfesional: profesional.registro_profesional,
        }
      : null,
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h1 className="text-xl font-bold">Receta para imprimir</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/pacientes/${id}/receta/${recetaId}/editar`}
            className="rounded-lg border border-tinta-suave/30 px-3 py-1.5 text-sm font-medium text-brand-dark transition hover:bg-crema-claro"
          >
            ✎ Editar
          </Link>
          <EnviarRecetaCorreo
            pacienteNombre={paciente.nombre}
            emailDefault={emailDestino}
            datos={datosPdf}
          />
          <DescargarPdf datos={datosPdf} />
          <BotonImprimir />
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 text-tinta shadow-sm print:rounded-none print:p-0 print:shadow-none">
        <div className="mb-5 flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
          <div className="flex items-center gap-4">
            {optica?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optica.logo_url} alt="" className="h-24 w-24 object-contain" />
            ) : (
              <Image src="/logo.svg" alt="" width={96} height={96} className="rounded-xl" />
            )}
            <div>
              <h2 className="text-lg font-bold text-tinta">{optica?.nombre_comercial}</h2>
              {(optica?.direccion || optica?.telefono) && (
                <p className="text-xs text-tinta-suave">
                  {[optica?.direccion, formatearTelefono(optica?.telefono)].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-dark">Receta óptica</p>
            <p className="text-xs text-tinta-suave">{fechaLegible(receta.fecha)}</p>
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
            <tr className="bg-crema text-left text-xs uppercase text-tinta-suave">
              <th className="border border-brand/30 px-2 py-1.5"></th>
              <th className="border border-brand/30 px-2 py-1.5">Esfera</th>
              <th className="border border-brand/30 px-2 py-1.5">Cilindro</th>
              <th className="border border-brand/30 px-2 py-1.5">Eje</th>
              <th className="border border-brand/30 px-2 py-1.5">Agudeza visual</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-brand/30 px-2 py-2 font-bold text-brand-dark">OD</td>
              <td className="border border-brand/30 px-2 py-2">{fmtD(receta.od_esfera)}</td>
              <td className="border border-brand/30 px-2 py-2">{fmtD(receta.od_cilindro)}</td>
              <td className="border border-brand/30 px-2 py-2">{receta.od_eje !== null ? `${receta.od_eje}°` : "—"}</td>
              <td className="border border-brand/30 px-2 py-2">{receta.av_od ?? "—"}</td>
            </tr>
            <tr>
              <td className="border border-brand/30 px-2 py-2 font-bold text-brand-dark">OI</td>
              <td className="border border-brand/30 px-2 py-2">{fmtD(receta.oi_esfera)}</td>
              <td className="border border-brand/30 px-2 py-2">{fmtD(receta.oi_cilindro)}</td>
              <td className="border border-brand/30 px-2 py-2">{receta.oi_eje !== null ? `${receta.oi_eje}°` : "—"}</td>
              <td className="border border-brand/30 px-2 py-2">{receta.av_oi ?? "—"}</td>
            </tr>
          </tbody>
        </table>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-tinta-suave">
            DP: {receta.dp ?? "—"} mm · Altura: {receta.altura ?? "—"} mm
          </p>
          {/* La adición no va en la tabla: solo aplica a algunos pacientes
              (présbicia) y queda como anexo aparte de la receta de lejos,
              como se ve en la mayoría de las recetas ópticas. */}
          <p className="rounded border border-brand/30 px-3 py-1.5 text-sm">
            <span className="font-semibold">ADD:</span>{" "}
            {receta.od_add === receta.oi_add
              ? fmtD(receta.od_add)
              : `OD ${fmtD(receta.od_add)} · OI ${fmtD(receta.oi_add)}`}
          </p>
        </div>

        {(alertas.length > 0 || observaciones.length > 0) && (
          <div className="mb-5 rounded border border-brand/30 bg-crema-claro p-3 text-sm">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-dark">
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

        {/* Contacto (WhatsApp) a la izquierda, firma y timbre del
            profesional en un solo recuadro a la derecha — el nombre, título
            y registro impresos YA hacen de firma/timbre, no hace falta
            dejar espacio en blanco arriba como si faltara estampar algo. */}
        <div className="mt-10 flex flex-wrap items-end justify-between gap-4 print:mt-16">
          {optica?.telefono && (
            <a
              href={`https://wa.me/${optica.telefono.replace(/\D/g, "")}`}
              className="flex items-center gap-2 text-sm text-tinta-suave no-underline"
            >
              <svg viewBox="0 0 32 32" width="22" height="22" fill="#25D366" aria-hidden="true">
                <circle cx="16" cy="16" r="16" />
                <path
                  fill="#fff"
                  d="M23.47 8.52A10.6 10.6 0 0 0 16.02 5.3c-5.87 0-10.65 4.77-10.65 10.63 0 1.87.49 3.7 1.42 5.31L5.3 26.7l5.6-1.47a10.66 10.66 0 0 0 5.1 1.3h.01c5.87 0 10.65-4.77 10.65-10.63 0-2.84-1.1-5.51-3.19-7.38Zm-7.45 16.35h-.01a8.85 8.85 0 0 1-4.51-1.24l-.32-.19-3.32.87.89-3.24-.21-.33a8.79 8.79 0 0 1-1.35-4.71c0-4.87 3.97-8.83 8.85-8.83a8.8 8.8 0 0 1 8.83 8.85c0 4.87-3.97 8.82-8.85 8.82Zm4.85-6.62c-.27-.13-1.58-.78-1.82-.87-.24-.09-.42-.13-.6.13-.18.27-.68.87-.84 1.04-.15.18-.31.2-.58.07-.27-.13-1.12-.41-2.14-1.32a8.03 8.03 0 0 1-1.48-1.84c-.15-.27-.02-.41.12-.54.12-.12.27-.31.4-.47.13-.15.18-.27.27-.44.09-.18.04-.34-.02-.47-.07-.13-.6-1.45-.82-1.98-.22-.52-.44-.45-.6-.46h-.51c-.18 0-.47.07-.71.34-.24.27-.94.92-.94 2.24 0 1.32.96 2.6 1.1 2.78.13.18 1.9 2.9 4.6 4.06.64.28 1.15.44 1.54.57.65.2 1.24.18 1.71.11.52-.08 1.58-.65 1.81-1.28.22-.62.22-1.16.16-1.28-.07-.12-.24-.19-.51-.32Z"
                />
              </svg>
              {formatearTelefono(optica.telefono)}
            </a>
          )}
          <div className="ml-auto flex w-64 flex-col items-center gap-1 rounded border border-brand/40 px-3 py-3 text-center text-xs text-tinta-suave">
            {datosPdf.profesional ? (
              <>
                <p className="font-semibold text-tinta">{datosPdf.profesional.nombre}</p>
                <p>{datosPdf.profesional.tituloProfesional}</p>
                {datosPdf.profesional.rut && <p>RUT: {datosPdf.profesional.rut}</p>}
                {datosPdf.profesional.registroProfesional && (
                  <p>Registro N.° {datosPdf.profesional.registroProfesional}</p>
                )}
              </>
            ) : (
              <p className="text-tinta-suave">Firma profesional</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
